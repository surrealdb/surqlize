import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../../src/cli/config";

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
