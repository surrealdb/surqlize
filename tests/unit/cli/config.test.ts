import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	availableEnvironments,
	loadConfig,
	UnknownEnvironmentError,
} from "../../../src/cli/config";

/**
 * Where the CLI's settings come from.
 *
 * These run against a real temporary directory rather than a mocked `fs`. The
 * precedence rules are the whole point of the module, and a mock that returns
 * whatever the test told it to would not check them.
 */

let dir: string;

/** The `SURREAL_*` variables, saved so each test starts from a known state. */
const KEYS = [
	"SURREAL_SCHEMA",
	"SURREAL_URL",
	"SURREAL_NAMESPACE",
	"SURREAL_DATABASE",
	"SURREAL_USERNAME",
	"SURREAL_PASSWORD",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "surqlize-config-"));
	saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
	for (const key of KEYS) delete process.env[key];
});

afterEach(async () => {
	for (const [key, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	await rm(dir, { recursive: true, force: true });
});

/** Write a config file into the temp directory. */
async function config(filename: string, body: string): Promise<void> {
	await writeFile(join(dir, filename), body, "utf-8");
}

describe("With nothing configured", () => {
	test("falls back to defaults", async () => {
		expect(await loadConfig({}, dir)).toEqual({
			schema: "./schema.ts",
			url: "ws://localhost:8000",
			namespace: "test",
			database: "test",
			username: "root",
			password: "root",
		});
	});
});

describe("A config file", () => {
	test("is read from a default export", async () => {
		await config(
			"surqlize.config.ts",
			"export default { namespace: 'app', database: 'prod' };",
		);

		const loaded = await loadConfig({}, dir);

		expect(loaded.namespace).toBe("app");
		expect(loaded.database).toBe("prod");
	});

	test("leaves unmentioned settings at their defaults", async () => {
		await config("surqlize.config.ts", "export default { namespace: 'app' };");

		expect((await loadConfig({}, dir)).url).toBe("ws://localhost:8000");
	});

	test("is found under any of its accepted names", async () => {
		await config("surqlize.config.mjs", "export default { namespace: 'mjs' };");

		expect((await loadConfig({}, dir)).namespace).toBe("mjs");
	});

	test("the first name in the list wins when several exist", async () => {
		await config("surqlize.config.ts", "export default { namespace: 'ts' };");
		await config("surqlize.config.mjs", "export default { namespace: 'mjs' };");

		expect((await loadConfig({}, dir)).namespace).toBe("ts");
	});
});

describe("Precedence", () => {
	test("the environment beats the file", async () => {
		// So a deployment can override a checked-in config without editing it
		await config("surqlize.config.ts", "export default { namespace: 'file' };");
		process.env.SURREAL_NAMESPACE = "env";

		expect((await loadConfig({}, dir)).namespace).toBe("env");
	});

	test("a flag beats the environment", async () => {
		process.env.SURREAL_NAMESPACE = "env";

		expect((await loadConfig({ namespace: "flag" }, dir)).namespace).toBe(
			"flag",
		);
	});

	test("an absent flag does not blank a configured value", async () => {
		// Overrides arrive with every key present and mostly undefined
		await config("surqlize.config.ts", "export default { namespace: 'file' };");

		const loaded = await loadConfig(
			{ namespace: undefined, url: "ws://elsewhere" },
			dir,
		);

		expect(loaded.namespace).toBe("file");
		expect(loaded.url).toBe("ws://elsewhere");
	});

	test("each setting resolves independently", async () => {
		await config(
			"surqlize.config.ts",
			"export default { namespace: 'file', database: 'file_db' };",
		);
		process.env.SURREAL_DATABASE = "env_db";

		const loaded = await loadConfig({ username: "flag_user" }, dir);

		expect(loaded.namespace).toBe("file");
		expect(loaded.database).toBe("env_db");
		expect(loaded.username).toBe("flag_user");
		expect(loaded.password).toBe("root");
	});
});

describe("Environments", () => {
	/** A config file with two environments over a shared base. */
	async function withEnvironments(): Promise<void> {
		await config(
			"surqlize.config.ts",
			`export default {
  url: "ws://base:8000",
  namespace: "shared",
  database: "base_db",
  environments: {
    staging: { database: "staging_db" },
    production: { url: "wss://prod:8000", database: "prod_db" },
  },
};`,
		);
	}

	test("are ignored until one is named", async () => {
		await withEnvironments();

		const loaded = await loadConfig({}, dir);

		expect(loaded.url).toBe("ws://base:8000");
		expect(loaded.database).toBe("base_db");
	});

	test("never leak into the resolved config", async () => {
		await withEnvironments();

		expect("environments" in (await loadConfig({}, dir))).toBe(false);
	});

	test("override only what they mention", async () => {
		await withEnvironments();

		const loaded = await loadConfig({}, dir, "staging");

		expect(loaded.database).toBe("staging_db");
		expect(loaded.url).toBe("ws://base:8000");
		expect(loaded.namespace).toBe("shared");
	});

	test("can override everything they need to", async () => {
		await withEnvironments();

		const loaded = await loadConfig({}, dir, "production");

		expect(loaded.url).toBe("wss://prod:8000");
		expect(loaded.database).toBe("prod_db");
	});

	test("sit under the environment variables and the flags", async () => {
		// A one-off run has to be able to redirect a named environment
		await withEnvironments();
		process.env.SURREAL_NAMESPACE = "from_env";

		const loaded = await loadConfig(
			{ database: "from_flag" },
			dir,
			"production",
		);

		expect(loaded.url).toBe("wss://prod:8000");
		expect(loaded.namespace).toBe("from_env");
		expect(loaded.database).toBe("from_flag");
	});

	test("an unknown name is refused, listing the ones that exist", async () => {
		await withEnvironments();

		const failure = await loadConfig({}, dir, "prod").catch((e: unknown) => e);

		expect(failure).toBeInstanceOf(UnknownEnvironmentError);
		expect((failure as Error).message).toContain("staging");
		expect((failure as Error).message).toContain("production");
	});

	test("naming one when the file defines none says so", async () => {
		await config(
			"surqlize.config.ts",
			"export default { url: 'ws://x:8000' };",
		);

		const failure = await loadConfig({}, dir, "staging").catch(
			(e: unknown) => e,
		);

		expect((failure as Error).message).toContain("none defined");
	});

	test("are reportable without resolving one", async () => {
		await withEnvironments();

		expect(await availableEnvironments(dir)).toEqual(["staging", "production"]);
	});

	test("a file with none reports none", async () => {
		await config(
			"surqlize.config.ts",
			"export default { url: 'ws://x:8000' };",
		);

		expect(await availableEnvironments(dir)).toEqual([]);
	});
});
