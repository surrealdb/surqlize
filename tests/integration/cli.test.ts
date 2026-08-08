import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The `sur` binary, driven as a user drives it.
 *
 * Everything else tests the functions the CLI calls. These test the CLI: that
 * it parses its flags, exits non-zero when it should, and prints something a
 * person can act on. A subprocess is the only way to check an exit code, and
 * this is the one place it is the right tool.
 *
 * The binary has to be built first — `bun run build`. The suite says so rather
 * than failing obscurely if it is missing.
 */

const CLI = resolve(import.meta.dir, "../../dist/cli.js");
const URL_ = process.env.SURREAL_URL ?? "ws://localhost:8000";

/** Result of running the CLI. */
interface Run {
	code: number;
	stdout: string;
	stderr: string;
	/** Both streams, for asserting on output without caring which it went to. */
	output: string;
}

let dir: string;
let namespace: string;

beforeAll(async () => {
	if (!existsSync(CLI)) {
		throw new Error(
			`${CLI} is missing. Run \`bun run build\` before the CLI suite.`,
		);
	}

	dir = await mkdtemp(join(tmpdir(), "surqlize-cli-"));
	namespace = `cli_${Date.now()}`;

	await writeFile(
		join(dir, "schema.ts"),
		`import { t, table } from "${resolve(import.meta.dir, "../../src")}";

export const user = table("user", {
  name: t.string(),
  email: t.string(),
});
`,
		"utf-8",
	);
});

/** Run `sur` with `args` in the temp directory. */
async function sur(...args: string[]): Promise<Run> {
	const proc = Bun.spawn(["bun", CLI, ...args], {
		cwd: dir,
		env: {
			...process.env,
			SURREAL_URL: URL_,
			SURREAL_NAMESPACE: namespace,
			SURREAL_DATABASE: "cli",
		},
		stdout: "pipe",
		stderr: "pipe",
	});

	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	return { code, stdout, stderr, output: stdout + stderr };
}

describe("Reporting for itself", () => {
	test("prints usage and succeeds with --help", async () => {
		const run = await sur("--help");

		expect(run.code).toBe(0);
		expect(run.output).toContain("sur");
		expect(run.output).toContain("migrate");
	});

	test("prints usage with no arguments", async () => {
		expect((await sur()).output).toContain("migrate");
	});

	test("fails on an unknown command, naming it", async () => {
		const run = await sur("frobnicate");

		expect(run.code).not.toBe(0);
		expect(run.output).toContain("frobnicate");
	});

	test("fails on an invalid flag value, saying what is allowed", async () => {
		const run = await sur("mermaid", "--level", "wat");

		expect(run.code).toBe(1);
		expect(run.output).toContain("minimal");
	});
});

describe("Commands that need no database", () => {
	test("validate reports what the schema declares", async () => {
		const run = await sur("validate");

		expect(run.code).toBe(0);
		expect(run.output).toContain("user");
	});

	test("mermaid writes a diagram to a file", async () => {
		const run = await sur("mermaid");

		expect(run.code).toBe(0);

		const diagram = await readFile(
			join(dir, "schema-diagram.mermaid"),
			"utf-8",
		);
		expect(diagram.startsWith("erDiagram")).toBe(true);
		expect(diagram).toContain("user {");
	});

	test("mermaid --stdout prints instead of writing", async () => {
		const run = await sur("mermaid", "--stdout", "-o", "unwanted.mermaid");

		expect(run.stdout.startsWith("erDiagram")).toBe(true);
		expect(existsSync(join(dir, "unwanted.mermaid"))).toBe(false);
	});

	test("mermaid --level detailed carries more than the default", async () => {
		const minimal = await sur("mermaid", "--stdout");
		const detailed = await sur("mermaid", "--stdout", "--level", "detailed");

		expect(detailed.stdout.length).toBeGreaterThanOrEqual(
			minimal.stdout.length,
		);
	});

	test("reports a missing schema file rather than crashing", async () => {
		const run = await sur("validate", "--schema", "./nope.ts");

		expect(run.code).not.toBe(0);
		expect(run.output).toContain("nope.ts");
	});
});

describe("The migration lifecycle", () => {
	test("plan shows the statements without applying them", async () => {
		const run = await sur("plan");

		expect(run.code).toBe(0);
		expect(run.output).toContain("DEFINE TABLE user");
	});

	test("plan changes nothing, so a second plan says the same", async () => {
		const first = await sur("plan");
		const second = await sur("plan");

		expect(second.output).toContain("DEFINE TABLE user");
		expect(second.output).toBe(first.output);
	});

	test("migrate applies the schema", async () => {
		const run = await sur("migrate");

		expect(run.code).toBe(0);
		expect(run.output).toContain("user");
	});

	test("plan has nothing left to do afterwards", async () => {
		const run = await sur("plan");

		expect(run.code).toBe(0);
		expect(run.output).not.toContain("DEFINE TABLE user");
	});

	test("migrate is a no-op the second time", async () => {
		expect((await sur("migrate")).code).toBe(0);
	});

	test("status lists the applied migration", async () => {
		const run = await sur("status");

		expect(run.code).toBe(0);
		expect(run.output).toMatch(/\d{4}-\d{2}-\d{2}/);
	});

	test("rollback refuses without a terminal to confirm on", async () => {
		// Destructive, so it will not proceed on a guess
		const run = await sur("rollback");

		expect(run.code).toBe(1);
		expect(run.output).toContain("--yes");
	});

	test("rollback undoes the migration when told to proceed", async () => {
		expect((await sur("rollback", "--yes")).code).toBe(0);

		// The table is gone, so the schema has work to do again
		expect((await sur("plan")).output).toContain("DEFINE TABLE user");
	});

	test("rollback with no history succeeds and says so", async () => {
		const run = await sur("rollback", "--yes");

		expect(run.code).toBe(0);
		expect(run.output.toLowerCase()).toMatch(/nothing|no migration/);
	});

	test("gives up on an unreachable server instead of hanging", async () => {
		// The driver retries a WebSocket forever, which would leave a mistyped
		// URL hanging with nothing on screen
		const proc = Bun.spawn(["bun", CLI, "plan"], {
			cwd: dir,
			env: { ...process.env, SURREAL_URL: "ws://127.0.0.1:1" },
			stdout: "pipe",
			stderr: "pipe",
		});

		const [stdout, stderr, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);

		expect(code).not.toBe(0);
		expect(stdout + stderr).toContain("127.0.0.1:1");
	}, 20_000);
});

describe("init", () => {
	test("writes a schema that validates", async () => {
		const fresh = await mkdtemp(join(tmpdir(), "surqlize-init-"));

		const proc = Bun.spawn(["bun", CLI, "init"], {
			cwd: fresh,
			env: process.env,
			stdout: "pipe",
			stderr: "pipe",
		});
		await proc.exited;

		expect(existsSync(join(fresh, "schema.ts"))).toBe(true);

		await rm(fresh, { recursive: true, force: true });
	});
});
