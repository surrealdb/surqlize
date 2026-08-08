import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadDefinitions } from "../../../src/cli/schema";

/** Write a schema module to a temporary directory and return its path. */
function writeSchema(source: string): string {
	const dir = mkdtempSync(join(tmpdir(), "surqlize-cli-"));
	const path = join(dir, "schema.ts");
	writeFileSync(path, source, "utf-8");
	return path;
}

const IMPORTS = `import { t, table, edge } from "${process.cwd()}/src";
import { param } from "${process.cwd()}/src/schema/ddl/entities";`;

describe("Loading a schema module", () => {
	test("collects named exports", async () => {
		const path = writeSchema(`${IMPORTS}
export const user = table("user", { name: t.string() });
export const post = table("post", { title: t.string() });
`);

		const definitions = await loadDefinitions(path);
		expect(definitions).toHaveLength(2);
	});

	test("collects definitions grouped in a default export", async () => {
		const path = writeSchema(`${IMPORTS}
const user = table("user", { name: t.string() });
export default { user };
`);

		expect(await loadDefinitions(path)).toHaveLength(1);
	});

	test("does not count a definition twice", async () => {
		// Exporting the same table both ways is common and must not migrate twice.
		const path = writeSchema(`${IMPORTS}
export const user = table("user", { name: t.string() });
export default { user };
`);

		expect(await loadDefinitions(path)).toHaveLength(1);
	});

	test("collects edges and database-level definitions too", async () => {
		const path = writeSchema(`${IMPORTS}
export const user = table("user", { name: t.string() });
export const post = table("post", { title: t.string() });
export const authored = edge("user", "authored", "post", {});
export const lim = param("lim", { value: "50" });
`);

		expect(await loadDefinitions(path)).toHaveLength(4);
	});

	test("explains itself when a module exports nothing usable", async () => {
		const path = writeSchema(`export const notASchema = { hello: "world" };`);

		expect(loadDefinitions(path)).rejects.toThrow(
			/exports no table, edge or database definitions/,
		);
	});

	test("reports which file could not be imported", async () => {
		expect(loadDefinitions("./does-not-exist.ts")).rejects.toThrow(
			/does-not-exist\.ts/,
		);
	});
});
