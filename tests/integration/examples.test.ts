import { describe, expect, test } from "bun:test";
import aiEmbeddings from "../../examples/ai-embeddings";
import blog from "../../examples/blog";
import ecommerce from "../../examples/ecommerce";
import minimal from "../../examples/minimal";
import socialNetwork from "../../examples/social-network";
import socialPlatform from "../../examples/social-platform";
import type { Definition } from "../../src/cli/schema";
import { diff } from "../../src/migrator/diff";
import { introspect } from "../../src/migrator/introspect";
import { withTestDb } from "./setup";

/**
 * The examples, run for real.
 *
 * They are the only end-to-end schemas of any size, so they combine things the
 * unit tests only see separately — a vector index next to a full-text one, a
 * sequence feeding a default, events that fire on a state change.
 *
 * The assertion is convergence: apply the schema, then ask whether anything is
 * still outstanding. It is the one check that catches a definition SurrealDB
 * stores differently from how it was written, and it is how the six
 * normalisation bugs in `convergence.test.ts` were found.
 *
 * Importing them here also puts them into the type check. `tsconfig.json`
 * excludes `examples`, but `exclude` only filters which files start the
 * program — an imported file still joins it.
 */
describe("The published examples", () => {
	const db = withTestDb({ perTest: true });

	/** Apply a schema, then report what a second run would still want to do. */
	async function applyTwice(definitions: Definition[]): Promise<string[]> {
		const before = await introspect(db().surreal);
		const { up } = diff(definitions, before);
		if (up.length) await db().surreal.query(up.join("\n"));

		const after = await introspect(db().surreal);
		return diff(definitions, after).up;
	}

	const examples: [string, Definition[]][] = [
		["minimal", minimal],
		["blog", blog],
		["social-network", socialNetwork],
		["social-platform", socialPlatform],
		["ecommerce", ecommerce],
		["ai-embeddings", aiEmbeddings],
	];

	test.each(
		examples,
	)("%s applies and then converges", async (_name, definitions) => {
		expect(await applyTwice(definitions)).toEqual([]);
	});

	test("each one actually defines something", async () => {
		// A schema that exported nothing would converge trivially, so the test
		// above would pass while proving nothing.
		for (const [name, definitions] of examples) {
			expect(
				definitions.length,
				`${name} exports no definitions`,
			).toBeGreaterThan(0);
		}
	});
});
