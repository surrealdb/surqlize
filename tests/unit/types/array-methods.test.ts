import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

/**
 * Compile-time assertions for the result types of array methods whose SurrealDB
 * results differ from the array they are called on. `tsc` (run by
 * `bun run type-check`) fails on any mismatch; the runtime checks render the
 * SurrealQL the same methods produce.
 */

type Equal<A, B> =
	(<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2
		? true
		: false;
const assertType = <T extends true>() => undefined as unknown as T;

const doc = table("doc", {
	nums: t.array(t.number()),
	words: t.array(t.string()),
	flags: t.array(t.bool()),
	grid: t.array(t.array(t.number())),
});

const db = orm(new Surreal(), doc);

function render(query: unknown) {
	const ctx = displayContext();
	return (
		query as { [__display]: (ctx: ReturnType<typeof displayContext>) => string }
	)[__display](ctx);
}

describe("array method result types", () => {
	test("pop() returns one element, or NONE for an empty array", () => {
		const q = db.select("doc").return((d) => ({ last: d.nums.pop() }));
		type Row = (typeof q)["entry"]["infer"];

		assertType<Equal<Row["last"], number | undefined>>();
		expect(render(q)).toContain("array::pop($this.nums)");
	});

	test("combine() returns an array of [element, element] pairs", () => {
		const q = db
			.select("doc")
			.return((d) => ({ pairs: d.nums.combine(d.words) }));
		type Row = (typeof q)["entry"]["infer"];

		assertType<Equal<Row["pairs"], [number, string][]>>();
		expect(render(q)).toContain("array::combine($this.nums, $this.words)");
	});

	test("filterIndex() returns the indexes, which are numbers", () => {
		const q = db
			.select("doc")
			.return((d) => ({ at: d.words.filterIndex("y") }));
		type Row = (typeof q)["entry"]["infer"];

		assertType<Equal<Row["at"], number[]>>();
	});

	test("booleanAnd() and booleanOr() return booleans whatever the element type", () => {
		const q = db.select("doc").return((d) => ({
			and: d.nums.booleanAnd(d.nums),
			or: d.words.booleanOr(d.words),
		}));
		type Row = (typeof q)["entry"]["infer"];

		assertType<Equal<Row["and"], boolean[]>>();
		assertType<Equal<Row["or"], boolean[]>>();
	});

	test("transpose() takes no argument and keeps the array type", () => {
		const q = db.select("doc").return((d) => ({ t: d.grid.transpose() }));
		type Row = (typeof q)["entry"]["infer"];

		assertType<Equal<Row["t"], number[][]>>();
		expect(render(q)).toContain("array::transpose($this.grid)");
	});

	test("slice() with no end renders without a second argument", () => {
		const q = db.select("doc").return((d) => ({ s: d.nums.slice(1) }));
		expect(render(q)).toMatch(/array::slice\(\$this\.nums, \$_v\d+\)/);
	});

	test("slice() with an end renders both arguments", () => {
		const q = db.select("doc").return((d) => ({ s: d.nums.slice(1, 3) }));
		expect(render(q)).toMatch(/array::slice\(\$this\.nums, \$_v\d+, \$_v\d+\)/);
	});

	test("boolean methods accept a literal array of the same element type", () => {
		const q = db
			.select("doc")
			.return((d) => ({ both: d.flags.booleanAnd([true, true]) }));
		const sql = render(q);
		expect(sql).toContain("array::boolean_and($this.flags, ");
		expect(sql).not.toContain("undefined");
	});

	test("value-taking methods accept a raw element and bind it as a variable", () => {
		const q = db.select("doc").return((d) => ({
			appended: d.nums.append(4),
			inserted: d.nums.insert(9, 0),
			found: d.nums.findIndex(2),
			filled: d.nums.fill(7),
		}));
		type Row = (typeof q)["entry"]["infer"];

		assertType<Equal<Row["appended"], number[]>>();
		assertType<Equal<Row["found"], number>>();
		const sql = render(q);
		expect(sql).toMatch(/array::append\(\$this\.nums, \$\w+\)/);
		expect(sql).toMatch(/array::insert\(\$this\.nums, \$\w+, \$\w+\)/);
		expect(sql).toMatch(/array::find_index\(\$this\.nums, \$\w+\)/);
		expect(sql).toMatch(/array::fill\(\$this\.nums, \$\w+\)/);
		expect(sql).not.toContain("undefined");
	});
});
