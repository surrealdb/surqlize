import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, set_, t, table } from "../../../src";
import { functionTable } from "../../../src/functions";

describe("Set functions", () => {
	const user = table("user", {
		tags: t.set(t.string()),
		roles: t.set(t.string()),
	});

	const db = orm(new Surreal(), user);

	test("set_.difference() generates set::difference", () => {
		const query = db.select("user").return((user) => ({
			diff: set_.difference(user.tags, user.roles),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("set::difference");
	});

	test("set_.intersect() generates set::intersect", () => {
		const query = db.select("user").return((user) => ({
			common: set_.intersect(user.tags, user.roles),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("set::intersect");
	});

	test("set_.len() generates set::len", () => {
		const query = db.select("user").return((user) => ({
			size: set_.len(user.tags),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("set::len");
	});

	test("set_.union() generates set::union", () => {
		const query = db.select("user").return((user) => ({
			all: set_.union(user.tags, user.roles),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("set::union");
	});
});

describe("set type functions", () => {
	const doc = table("doc", {
		tags: t.set(t.string()),
		nums: t.set(t.int()),
		list: t.array(t.string()),
	});
	const db = orm(new Surreal(), doc);

	const render = (
		build: Parameters<ReturnType<typeof db.select>["return"]>[0],
	) => db.select("doc").return(build)[__display](displayContext());

	test("a set resolves the set:: family", () => {
		expect(render((d) => ({ n: d.tags.len() }))).toContain("set::len(");
		expect(render((d) => ({ n: d.tags.add("x") }))).toContain("set::add(");
		expect(render((d) => ({ n: d.tags.union(new Set(["a"])) }))).toContain(
			"set::union(",
		);
		expect(render((d) => ({ n: d.tags.isEmpty() }))).toContain(
			"set::is_empty(",
		);
		expect(render((d) => ({ n: d.tags.join(",") }))).toContain("set::join(");
		expect(render((d) => ({ n: d.nums.max() }))).toContain("set::max(");
	});

	test("a set does not have the array-only functions", () => {
		expect(typeof (functionTable("set") as Record<string, unknown>).push).toBe(
			"undefined",
		);
		expect(typeof (functionTable("set") as Record<string, unknown>).sort).toBe(
			"undefined",
		);
		expect(
			typeof (functionTable("array") as Record<string, unknown>).push,
		).toBe("function");
	});

	test("an array does not resolve set:: functions", () => {
		expect(render((d) => ({ n: d.list.len() }))).toContain("array::len(");
	});

	test("standalone set functions keep the set type", () => {
		const q = db.select("doc").return((d) => ({
			u: set_.union(d.tags, d.tags),
		}));
		expect(q[__display](displayContext())).toContain("set::union(");
	});
});
