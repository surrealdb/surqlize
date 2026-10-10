import { describe, expect, test } from "bun:test";
import { orm, t, table } from "../../src";
import { withTestDb } from "./setup";

/**
 * Array methods whose TypeScript result type or arguments did not match what
 * SurrealDB returns, checked against a live server.
 */
const doc = table("doc", {
	nums: t.array(t.number()),
	words: t.array(t.string()),
	flags: t.array(t.bool()),
	grid: t.array(t.array(t.number())),
});

describe("array methods against a live server", () => {
	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await surreal.query(`
				CREATE doc:a SET
					nums = [1, 2, 3],
					words = ["x", "y", "z"],
					flags = [true, false],
					grid = [[1, 2], [3, 4]];
			`);
		},
	});

	const first = async <R>(query: {
		execute(): Promise<R[]>;
	}): Promise<R | undefined> => (await query.execute())[0];

	describe("pop()", () => {
		test("returns the last element, not an array", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({ last: d.nums.pop() })),
			);

			expect(row?.last).toBe(3);
		});

		test("works on a string array", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({ last: d.words.pop() })),
			);

			expect(row?.last).toBe("z");
		});
	});

	describe("combine()", () => {
		test("returns every pair of elements from the two arrays", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({ pairs: d.nums.combine(d.words) })),
			);

			expect(row?.pairs).toEqual([
				[1, "x"],
				[1, "y"],
				[1, "z"],
				[2, "x"],
				[2, "y"],
				[2, "z"],
				[3, "x"],
				[3, "y"],
				[3, "z"],
			]);
		});
	});

	describe("filterIndex()", () => {
		test("returns the indexes of the matching elements", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({ at: d.words.filterIndex("y") })),
			);

			expect(row?.at).toEqual([1]);
		});
	});

	describe("booleanAnd() / booleanOr()", () => {
		test("booleanAnd combines two boolean arrays element by element", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db
					.select("doc")
					.return((d) => ({ both: d.flags.booleanAnd([true, true]) })),
			);

			expect(row?.both).toEqual([true, false]);
		});

		test("booleanAnd accepts another field", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({ both: d.flags.booleanAnd(d.flags) })),
			);

			expect(row?.both).toEqual([true, false]);
		});

		test("booleanOr combines two boolean arrays element by element", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db
					.select("doc")
					.return((d) => ({ either: d.flags.booleanOr([false, false]) })),
			);

			expect(row?.either).toEqual([true, false]);
		});
	});

	describe("transpose()", () => {
		test("takes no argument and transposes a two-dimensional array", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({ t: d.grid.transpose() })),
			);

			expect(row?.t).toEqual([
				[1, 3],
				[2, 4],
			]);
		});
	});

	describe("slice()", () => {
		test("slice(start, end) takes the elements from start up to end", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({ s: d.nums.slice(1, 3) })),
			);

			expect(row?.s).toEqual([2, 3]);
		});

		test("slice(start) with no end takes the rest of the array", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({ s: d.nums.slice(1) })),
			);

			expect(row?.s).toEqual([2, 3]);
		});
	});

	// Set and logical methods take a literal array as well as a field. Before the
	// argument was wrapped, a literal crashed while the query was built.
	describe("set and logical methods with a literal array", () => {
		test("complement, concat, difference, intersect and union", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({
					complement: d.nums.complement([3, 4]),
					concat: d.nums.concat([3, 4]),
					difference: d.nums.difference([3, 4]),
					intersect: d.nums.intersect([3, 4]),
					union: d.nums.union([3, 4]),
				})),
			);

			expect(row).toEqual({
				complement: [1, 2],
				concat: [1, 2, 3, 3, 4],
				difference: [1, 2, 4],
				intersect: [3],
				union: [1, 2, 3, 4],
			});
		});

		test("logicalAnd, logicalOr and logicalXor", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({
					and: d.flags.logicalAnd([true, true]),
					or: d.flags.logicalOr([false, false]),
					xor: d.flags.logicalXor([true, true]),
				})),
			);

			expect(row).toEqual({
				and: [true, false],
				or: [true, false],
				xor: [false, true],
			});
		});
	});

	describe("value-taking methods accept raw values", () => {
		// These methods took a bare workable at runtime while their signatures took
		// any IntoWorkable, so a raw scalar type-checked and then threw a TypeError.
		test("append(), prepend(), push() and add() with a raw element", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({
					append: d.nums.append(4),
					prepend: d.nums.prepend(0),
					push: d.nums.push(5),
					add: d.nums.add(9),
					addPresent: d.nums.add(3),
				})),
			);

			expect(row).toEqual({
				append: [1, 2, 3, 4],
				prepend: [0, 1, 2, 3],
				push: [1, 2, 3, 5],
				add: [1, 2, 3, 9],
				addPresent: [1, 2, 3],
			});
		});

		test("insert() with a raw element and position", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({
					inserted: d.nums.insert(9, 0),
				})),
			);

			expect(row?.inserted).toEqual([9, 1, 2, 3]);
		});

		test("fill() and findIndex() with a raw element", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({
					filled: d.nums.fill(7),
					index: d.nums.findIndex(2),
				})),
			);

			expect(row).toEqual({ filled: [7, 7, 7], index: 1 });
		});

		test("works on string and bool arrays", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({
					words: d.words.append("w"),
					flags: d.flags.append(false),
				})),
			);

			expect(row).toEqual({
				words: ["x", "y", "z", "w"],
				flags: [true, false, false],
			});
		});

		test("still accepts a workable element", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, doc);

			const row = await first(
				db.select("doc").return((d) => ({
					appended: d.nums.append(d.nums.len()),
				})),
			);

			expect(row?.appended).toEqual([1, 2, 3, 3]);
		});
	});
});
