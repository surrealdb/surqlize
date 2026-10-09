import { describe, expect, test } from "bun:test";
import { checkBlocks, readReadme } from "./check";
import { extractBlocks } from "./extract";

/**
 * README harness. Every TypeScript block in README.md is type-checked against
 * the library source, except blocks marked `illustrative`. Fence modifiers:
 *
 * - none: must compile with no errors.
 * - `illustrative`: opt-out, for fragments that are not meant to compile on
 *   their own (`...`, alternatives that redeclare a name, multi-file imports).
 * - `known-bug`: must fail to compile, because of a tracked library bug. Once
 *   the bug is fixed the block compiles, the test fails, and the marker should
 *   be removed. A known-bug block only passes on a semantic error: a syntax
 *   error or an undefined name means the block itself is wrong.
 *
 * The blocks rely on the running example in `prelude.ts` for `db`, `surreal`
 * and the README's tables and edges, so a block only needs to declare what it
 * adds or shadows.
 */

describe("README code block extraction", () => {
	test("finds typescript and ts blocks and records the fence line", () => {
		const blocks = extractBlocks(
			[
				"text",
				"```bash",
				"bun add x",
				"```",
				"```typescript",
				"const a = 1;",
				"```",
				"```ts",
				"b;",
				"```",
			].join("\n"),
		);
		expect(blocks.map((b) => [b.index, b.line, b.mode, b.code])).toEqual([
			[1, 5, "check", "const a = 1;"],
			[2, 8, "check", "b;"],
		]);
	});

	test("reads the illustrative and known-bug modifiers", () => {
		const blocks = extractBlocks(
			[
				"```typescript illustrative",
				"x",
				"```",
				"```typescript known-bug",
				"y",
				"```",
			].join("\n"),
		);
		expect(blocks.map((b) => b.mode)).toEqual(["illustrative", "known-bug"]);
	});

	test("rejects an unknown modifier rather than skipping the block", () => {
		expect(() => extractBlocks("```typescript ilustrative\nx\n```")).toThrow(
			/unknown fence modifier "ilustrative"/,
		);
	});

	test("rejects an unterminated block", () => {
		expect(() => extractBlocks("```typescript\nconst a = 1;")).toThrow(
			/unterminated code block/,
		);
	});
});

const blocks = extractBlocks(readReadme());
const results = checkBlocks(blocks);

describe("README code blocks type-check", () => {
	test("the README has checked blocks", () => {
		expect(results.length).toBeGreaterThan(0);
	});

	for (const result of results) {
		const { block } = result;
		const label = `README.md:${block.line} (block ${block.index})`;

		if (block.mode === "known-bug") {
			test(`${label} is a known bug and still fails to compile`, () => {
				expect(
					result.errors.length,
					"known-bug block compiles: remove its marker",
				).toBeGreaterThan(0);
				expect(
					result.syntax,
					`syntax error, not the tracked bug:\n${result.errors.join("\n")}`,
				).toBe(false);
				expect(
					result.undefinedName,
					`undefined name, not the tracked bug:\n${result.errors.join("\n")}`,
				).toBe(false);
			});
			continue;
		}

		test(`${label} type-checks`, () => {
			expect(result.errors, `${label}\n${result.errors.join("\n")}`).toEqual(
				[],
			);
		});
	}
});
