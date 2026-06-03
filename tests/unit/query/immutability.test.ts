import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

/**
 * Query builders are immutable: every chaining method returns a *new* builder
 * rather than mutating `this`. These tests pin that contract so a half-built
 * query can be safely reused as the base for several divergent queries without
 * their state leaking into one another.
 */
describe("query builder immutability", () => {
	const user = table("user", {
		name: t.string(),
		age: t.number(),
		email: t.string(),
	});

	const db = orm(new Surreal(), user);

	/** Render a query and return the parameter values it bound. */
	function boundValues(query: {
		[__display](ctx: ReturnType<typeof displayContext>): string;
	}): unknown[] {
		const ctx = displayContext();
		query[__display](ctx);
		return Object.values(ctx.variables);
	}

	test("chaining returns a new instance, never `this`", () => {
		const base = db.select("user");
		const filtered = base.where(($this) => $this.age.gt(18));
		const limited = base.limit(5);

		expect(filtered).not.toBe(base);
		expect(limited).not.toBe(base);
		expect(filtered).not.toBe(limited);
	});

	test("branching a SELECT does not leak state across branches", () => {
		const base = db.select("user");
		const filtered = base.where(($this) => $this.age.gt(18));
		const limited = base.limit(5);

		// The base is untouched by either branch.
		const baseSql = base.toString();
		expect(baseSql).toContain("SELECT * FROM");
		expect(baseSql).not.toContain("WHERE");
		expect(baseSql).not.toContain("LIMIT");

		// Each branch carries only its own clause.
		expect(filtered.toString()).toContain("WHERE");
		expect(filtered.toString()).not.toContain("LIMIT");
		expect(limited.toString()).toContain("LIMIT");
		expect(limited.toString()).not.toContain("WHERE");
	});

	test("orderBy does not mutate the base's accumulated order list", () => {
		// Guards the copy-on-write fix in `_addOrderBy` (previously an in-place
		// `_orderBy.push`, which would corrupt every clone sharing the array).
		const base = db.select("user").orderBy("age");
		const both = base.orderBy("email");

		expect(base.toString()).toContain("ORDER BY age");
		expect(base.toString()).not.toContain("email");

		expect(both.toString()).toContain("age");
		expect(both.toString()).toContain("email");
	});

	test("branching SET-style modifications stays isolated", () => {
		const base = db.update("user");
		const byAge = base.set({ age: 30 });
		const byEmail = base.set({ email: "a@b.c" });

		expect(base.toString()).not.toContain("SET");
		expect(byAge.toString()).toContain("age");
		expect(byAge.toString()).not.toContain("email");
		expect(byEmail.toString()).toContain("email");
		expect(byEmail.toString()).not.toContain("age");
	});

	test("INSERT .values() does not mutate the base's row list", () => {
		// Guards the copy-on-write fix for `_values`. The row values are bound as
		// query parameters, so isolation is checked against the bound variables
		// rather than the rendered string.
		const base = db.insert("user").fields(["email"]);
		const one = base.values(["a@b.c"]);
		const two = base.values(["x@y.z"]);
		const oneThenMore = one.values(["c@d.e"]);

		expect(base.toString()).not.toContain("VALUES");

		const oneVars = boundValues(one);
		expect(oneVars).toContain("a@b.c");
		expect(oneVars).not.toContain("x@y.z");
		expect(oneVars).not.toContain("c@d.e");

		const twoVars = boundValues(two);
		expect(twoVars).toContain("x@y.z");
		expect(twoVars).not.toContain("a@b.c");

		const multiVars = boundValues(oneThenMore);
		expect(multiVars).toContain("a@b.c");
		expect(multiVars).toContain("c@d.e");
	});

	test("live query branching stays isolated", () => {
		const base = db.live("user");
		const filtered = base.where(($this) => $this.age.gt(18));

		expect(filtered).not.toBe(base);
		expect(base.toString()).not.toContain("WHERE");
		expect(filtered.toString()).toContain("WHERE");
	});
});
