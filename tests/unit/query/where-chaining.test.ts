import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

/**
 * Chained `.where()` calls AND together, on every builder that has `.where()`.
 * `where({})` (no condition) adds nothing, and `clearWhere()` removes the
 * conditions set so far.
 */
const user = table("user", {
	name: t.object({ first: t.string(), last: t.string() }),
	age: t.number(),
	email: t.string(),
});

const db = orm(new Surreal(), user);

const render = (q: unknown): string => {
	const ctx = displayContext();
	return (q as { [__display]: (c: typeof ctx) => string })[__display](ctx);
};

const WHERE_AND = /WHERE \(.+ AND .+\)/;

describe("chained where() on select", () => {
	test("chained callbacks AND together", () => {
		const sql = render(
			db
				.select("user")
				.where((u) => u.age.gt(18))
				.where((u) => u.email.eq("a@example.com")),
		);
		expect(sql).toMatch(WHERE_AND);
		expect(sql).toContain("age > ");
		expect(sql).toContain("email = ");
	});

	test("an object filter and a callback AND together", () => {
		const sql = render(
			db
				.select("user")
				.where({ age: { gt: 18 } })
				.where((u) => u.email.eq("a@example.com")),
		);
		expect(sql).toMatch(WHERE_AND);
	});

	test("three chained conditions all survive", () => {
		const sql = render(
			db
				.select("user")
				.where((u) => u.age.gt(18))
				.where((u) => u.age.lt(65))
				.where((u) => u.email.eq("a@example.com")),
		);
		expect(sql).toContain("age > ");
		expect(sql).toContain("age < ");
		expect(sql).toContain("email = ");
	});

	test("where({}) adds no condition, so an earlier filter stays", () => {
		const base = render(db.select("user").where((u) => u.age.gt(18)));
		expect(
			render(
				db
					.select("user")
					.where((u) => u.age.gt(18))
					.where({}),
			),
		).toBe(base);
	});

	test("where() with only undefined values adds no condition", () => {
		const base = render(db.select("user").where((u) => u.age.gt(18)));
		expect(
			render(
				db
					.select("user")
					.where((u) => u.age.gt(18))
					.where({ age: undefined }),
			),
		).toBe(base);
	});

	test("where({}) on its own leaves the query unfiltered", () => {
		expect(render(db.select("user").where({}))).not.toContain("WHERE");
	});

	test("clearWhere() removes every condition so far", () => {
		const sql = render(
			db
				.select("user")
				.where((u) => u.age.gt(18))
				.where((u) => u.email.eq("a@example.com"))
				.clearWhere(),
		);
		expect(sql).not.toContain("WHERE");
	});

	test("conditions added after clearWhere() start a fresh filter", () => {
		const sql = render(
			db
				.select("user")
				.where((u) => u.age.gt(18))
				.clearWhere()
				.where((u) => u.email.eq("a@example.com")),
		);
		expect(sql).toContain("WHERE $this.email = ");
		expect(sql).not.toContain("age");
	});
});

describe("chained where() on update", () => {
	test("chained callbacks AND together", () => {
		const sql = render(
			db
				.update("user")
				.set({ age: 1 })
				.where((u) => u.age.gt(18))
				.where((u) => u.email.eq("a@example.com")),
		);
		expect(sql).toMatch(WHERE_AND);
	});

	test("where({}) keeps the earlier filter; clearWhere() removes it", () => {
		const base = render(
			db
				.update("user")
				.set({ age: 1 })
				.where((u) => u.age.gt(18)),
		);
		expect(
			render(
				db
					.update("user")
					.set({ age: 1 })
					.where((u) => u.age.gt(18))
					.where({}),
			),
		).toBe(base);
		expect(
			render(
				db
					.update("user")
					.set({ age: 1 })
					.where((u) => u.age.gt(18))
					.clearWhere(),
			),
		).not.toContain("WHERE");
	});
});

describe("chained where() on delete", () => {
	test("chained callbacks AND together", () => {
		const sql = render(
			db
				.delete("user")
				.where((u) => u.age.gt(18))
				.where((u) => u.email.eq("a@example.com")),
		);
		expect(sql).toMatch(WHERE_AND);
	});

	test("where({}) keeps the earlier filter; clearWhere() removes it", () => {
		const base = render(db.delete("user").where((u) => u.age.gt(18)));
		expect(
			render(
				db
					.delete("user")
					.where((u) => u.age.gt(18))
					.where({}),
			),
		).toBe(base);
		expect(
			render(
				db
					.delete("user")
					.where((u) => u.age.gt(18))
					.clearWhere(),
			),
		).not.toContain("WHERE");
	});
});

describe("chained where() on upsert", () => {
	test("chained callbacks AND together", () => {
		const sql = render(
			db
				.upsert("user", "alice")
				.set({ age: 1 })
				.where((u) => u.age.gt(18))
				.where((u) => u.email.eq("a@example.com")),
		);
		expect(sql).toMatch(WHERE_AND);
	});

	test("clearWhere() removes the conditions set so far", () => {
		const sql = render(
			db
				.upsert("user", "alice")
				.set({ age: 1 })
				.where((u) => u.age.gt(18))
				.clearWhere(),
		);
		expect(sql).not.toContain("WHERE");
	});
});

describe("chained where() on live", () => {
	test("chained callbacks AND together", () => {
		const sql = render(
			db
				.live("user")
				.where((u) => u.age.gt(18))
				.where((u) => u.email.eq("a@example.com")),
		);
		expect(sql).toMatch(WHERE_AND);
	});

	test("where({}) keeps the earlier filter; clearWhere() removes it", () => {
		const base = render(db.live("user").where((u) => u.age.gt(18)));
		expect(
			render(
				db
					.live("user")
					.where((u) => u.age.gt(18))
					.where({}),
			),
		).toBe(base);
		expect(
			render(
				db
					.live("user")
					.where((u) => u.age.gt(18))
					.clearWhere(),
			),
		).not.toContain("WHERE");
	});
});
