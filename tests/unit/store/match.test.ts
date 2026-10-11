import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { applyOverlay } from "../../../src";
import { matchesWhere } from "../../../src/store/match";

const row = {
	id: new RecordId("task", "a"),
	title: "Write docs",
	done: false,
	priority: 3,
	tags: ["a", "b"],
	owner: new RecordId("user", "tobie"),
	due: new Date("2026-01-02T00:00:00Z"),
	meta: { color: "red", size: 2 },
};

const m = (filter: Record<string, unknown> | undefined, r: unknown = row) =>
	matchesWhere(filter, r);

describe("matchesWhere", () => {
	test("sets compare by members, not by their text", () => {
		const r = { tags: new Set(["a", "b"]) };
		expect(m({ tags: { eq: new Set(["b", "a"]) } }, r)).toBe(true);
		expect(m({ tags: { eq: new Set(["a", "c"]) } }, r)).toBe(false);
		expect(m({ tags: { eq: new Set(["a"]) } }, r)).toBe(false);
	});

	test("no filter matches everything", () => {
		expect(m(undefined)).toBe(true);
		expect(m({})).toBe(true);
	});

	test("a bare value is equality", () => {
		expect(m({ done: false })).toBe(true);
		expect(m({ done: true })).toBe(false);
		expect(m({ title: "Write docs", priority: 3 })).toBe(true);
		expect(m({ title: "Write docs", priority: 4 })).toBe(false);
	});

	test("compares dates, record ids, arrays and objects by value", () => {
		expect(m({ due: new Date("2026-01-02T00:00:00Z") })).toBe(true);
		expect(m({ owner: new RecordId("user", "tobie") })).toBe(true);
		expect(m({ owner: new RecordId("user", "other") })).toBe(false);
		expect(m({ tags: ["a", "b"] })).toBe(true);
		expect(m({ tags: ["b", "a"] })).toBe(false);
		expect(m({ meta: { eq: { color: "red", size: 2 } } })).toBe(true);
	});

	test("comparison operators on numbers, strings and dates", () => {
		expect(m({ priority: { gt: 2 } })).toBe(true);
		expect(m({ priority: { gt: 3 } })).toBe(false);
		expect(m({ priority: { gte: 3, lt: 10 } })).toBe(true);
		expect(m({ priority: { lte: 2 } })).toBe(false);
		expect(m({ title: { gt: "A" } })).toBe(true);
		expect(m({ due: { gt: new Date("2025-01-01") } })).toBe(true);
		expect(m({ priority: { ne: 3 } })).toBe(false);
	});

	test("inside, contains and string operators", () => {
		expect(m({ priority: { inside: [1, 3] } })).toBe(true);
		expect(m({ priority: { notInside: [1, 3] } })).toBe(false);
		expect(m({ tags: { contains: "a" } })).toBe(true);
		expect(m({ tags: { containsNot: "z" } })).toBe(true);
		expect(m({ tags: { containsAll: ["a", "b"] } })).toBe(true);
		expect(m({ tags: { containsAny: ["z", "b"] } })).toBe(true);
		expect(m({ tags: { containsNone: ["z"] } })).toBe(true);
		expect(m({ tags: { allInside: ["a", "b", "c"] } })).toBe(true);
		expect(m({ tags: { noneInside: ["a"] } })).toBe(false);
		expect(m({ title: { startsWith: "Write" } })).toBe(true);
		expect(m({ title: { endsWith: "x" } })).toBe(false);
		expect(m({ title: { contains: "doc" } })).toBe(true);
	});

	test("and, or and not combine, and a field named like an operator still works", () => {
		expect(m({ or: [{ done: true }, { priority: 3 }] })).toBe(true);
		expect(m({ and: [{ done: false }, { priority: { gt: 5 } }] })).toBe(false);
		expect(m({ not: { done: true } })).toBe(true);
		expect(m({ not: { or: [{ done: false }] } })).toBe(false);
		expect(m({ eq: 1 }, { eq: 1 })).toBe(true);
	});

	test("nested object fields", () => {
		expect(m({ meta: { color: "red" } })).toBe(true);
		expect(m({ meta: { color: "blue" } })).toBe(false);
		expect(m({ meta: { size: { gt: 1 } } })).toBe(true);
	});

	test("says unknown when it cannot tell", () => {
		// An expression, a field of a linked record, an operator it does not model.
		expect(m({ owner: { name: "x" } })).toBeUndefined();
		expect(m({ title: { search: "docs" } })).toBeUndefined();
		expect(m({ priority: { gt: "x" } })).toBeUndefined();
		expect(m({ tags: { contains: { weird: 1 } } })).toBe(false);
		expect(m({ title: { startsWith: 5 } })).toBeUndefined();
	});

	test("three-valued logic: a false wins an and, a true wins an or", () => {
		const unknown = { owner: { name: "x" } };
		expect(m({ and: [{ done: true }, unknown] })).toBe(false);
		expect(m({ and: [{ done: false }, unknown] })).toBeUndefined();
		expect(m({ or: [{ done: false }, unknown] })).toBe(true);
		expect(m({ or: [{ done: true }, unknown] })).toBeUndefined();
		expect(m({ not: unknown })).toBeUndefined();
	});

	test("a field that is not set: absent for a whole record, unknown for a partial one", () => {
		const whole = { id: row.id, title: "x" };
		expect(m({ done: false }, whole)).toBe(false);
		expect(m({ done: { ne: false } }, whole)).toBe(true);
		expect(m({ priority: { gt: 1 } }, whole)).toBeUndefined();
		// A create carries only some fields; the database may supply a default.
		expect(
			matchesWhere({ done: false }, whole, { partial: true }),
		).toBeUndefined();
		expect(matchesWhere({ title: "x" }, whole, { partial: true })).toBe(true);
		expect(matchesWhere({ title: "y" }, whole, { partial: true })).toBe(false);
	});

	test("ignores a field whose condition is undefined", () => {
		expect(m({ done: undefined, priority: 3 })).toBe(true);
	});
});

describe("applyOverlay with a check", () => {
	type Row = { id: RecordId; done: boolean; title: string };
	const r = (id: string, done: boolean): Row => ({
		id: new RecordId("task", id),
		done,
		title: id,
	});
	const key = (x: Row) => String(x.id);

	test("adds a created row only when it passes the check", () => {
		const out = applyOverlay(
			[],
			[
				{
					table: "task",
					id: "a",
					kind: "create",
					data: { done: false, title: "a" },
				},
				{
					table: "task",
					id: "b",
					kind: "create",
					data: { done: true, title: "b" },
				},
			],
			key,
			(row) => row.done === false,
		);
		expect(out.map((x) => x.title)).toEqual(["a"]);
	});

	test("removes a row an update makes fail the check, and keeps one that passes", () => {
		const out = applyOverlay(
			[r("a", false), r("b", false)],
			[
				{ table: "task", id: "a", kind: "update", data: { done: true } },
				{ table: "task", id: "b", kind: "update", data: { title: "B" } },
			],
			key,
			false,
			(row) => row.done === false,
		);
		expect(out.map((x) => x.title)).toEqual(["B"]);
	});
});
