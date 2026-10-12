import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import {
	__display,
	and,
	displayContext,
	OrmError,
	orm,
	t,
	table,
} from "../../../src";

describe("object-based where / orderBy", () => {
	const user = table("user", {
		name: t.object({ first: t.string(), last: t.string() }),
		age: t.number(),
		email: t.string(),
		nick: t.option(t.string()),
		tags: t.array(t.string()),
		manager: t.option(t.record("user")),
		org: t.record("org"),
	});
	const org = table("org", { title: t.string(), size: t.number() });
	const db = orm(new Surreal(), user, org);

	const render = (q: { [__display]: (c: never) => string }) => {
		const ctx = displayContext();
		return {
			sql: (q as { [__display]: (c: typeof ctx) => string })[__display](ctx),
			vars: Object.values(ctx.variables),
		};
	};

	test("shorthand equality and operators match the fluent form", () => {
		const obj = render(
			db.select("user").where({ email: "a@b.c", age: { gt: 18, lte: 65 } }),
		);
		const fluent = render(
			db
				.select("user")
				.where((u) => and(u.email.eq("a@b.c"), u.age.gt(18), u.age.lte(65))),
		);
		expect(obj.sql).toBe(fluent.sql);
		expect(obj.vars).toEqual(fluent.vars);
	});

	test("single condition has no wrapping", () => {
		const { sql } = render(db.select("user").where({ age: { gte: 21 } }));
		expect(sql).toContain("WHERE $this.age >= ");
	});

	test("array and string operators", () => {
		const { sql } = render(
			db.select("user").where({
				tags: { containsAny: ["a", "b"] },
				email: { endsWith: "@x.io" },
				age: { inside: [1, 2] },
			}),
		);
		expect(sql).toContain("$this.tags CONTAINSANY");
		expect(sql).toContain("string::ends_with($this.email");
		expect(sql).toContain("$this.age IN");
	});

	test("nested object fields and record links", () => {
		const { sql } = render(
			db.select("user").where({
				name: { first: "Ada" },
				manager: { age: { gt: 40 } },
				org: { title: "Acme" },
			}),
		);
		expect(sql).toContain("$this.name.first = ");
		expect(sql).toContain("$this.manager.age > ");
		expect(sql).toContain("$this.org.title = ");
	});

	test("and / or / not combinators", () => {
		const { sql } = render(
			db.select("user").where({
				or: [{ age: { lt: 18 } }, { age: { gt: 65 }, email: "x" }],
				not: { nick: "bob" },
			}),
		);
		expect(sql).toMatch(
			/WHERE \(\(\$this\.age < \S+ OR \(\$this\.age > \S+ AND \$this\.email = \S+\)\) AND !\(\$this\.nick = \S+\)\)/,
		);
	});

	test("explicit and", () => {
		const { sql } = render(
			db.select("user").where({ and: [{ age: 1 }, { email: "e" }] }),
		);
		expect(sql).toMatch(/WHERE \(\$this\.age = \S+ AND \$this\.email = \S+\)/);
	});

	test("undefined values and empty groups are ignored", () => {
		const q = render(
			db.select("user").where({ age: undefined, or: [], and: [{}] }),
		);
		expect(q.sql).not.toContain("WHERE");
		const q2 = render(
			db.select("user").where({ age: { gt: undefined }, email: "e" }),
		);
		expect(q2.sql).toContain("WHERE $this.email = ");
	});

	test("an empty object adds no condition, so an earlier filter is kept", () => {
		const { sql } = render(
			db
				.select("user")
				.where((u) => u.age.gt(1))
				.where({}),
		);
		expect(sql).toContain("WHERE $this.age > ");
		expect(sql).not.toContain("AND");
	});

	test("unknown keys and unsupported operators throw", () => {
		expect(() =>
			// @ts-expect-error unknown field
			render(db.select("user").where({ nope: 1 })),
		).toThrow(OrmError);
		expect(() =>
			render(
				// @ts-expect-error startsWith is a string operator
				db.select("user").where({ age: { startsWith: "a" } }),
			),
		).toThrow(OrmError);
		expect(() =>
			// @ts-expect-error not a field of the nested link
			render(db.select("user").where({ org: { nope: 1 } })),
		).toThrow(OrmError);
	});

	test("field names that shadow operators still resolve as fields", () => {
		const shadow = table("shadow", { gt: t.number(), eq: t.number() });
		const d = orm(new Surreal(), shadow);
		const { sql } = render(d.select("shadow").where({ eq: 2, gt: 1 }));
		expect(sql).toContain("$this.eq = ");
		expect(sql).toContain("$this.gt = ");
	});

	test("orderBy object", () => {
		const { sql } = render(
			db.select("user").orderBy({ age: "desc", email: "ASC" }),
		);
		expect(sql).toContain("ORDER BY age DESC, email ASC");
	});

	test("orderBy nested and chained with fluent form", () => {
		const { sql } = render(
			db
				.select("user")
				.orderBy({ name: { last: "asc" }, org: { title: "desc" } })
				.orderBy("age", "DESC")
				.orderByNumeric("email"),
		);
		expect(sql).toContain(
			"ORDER BY name.last ASC, org.title DESC, age DESC, email NUMERIC",
		);
	});

	test("orderBy rejects bad directions and fields", () => {
		expect(() =>
			// @ts-expect-error invalid direction
			render(db.select("user").orderBy({ age: "up" })),
		).toThrow(OrmError);
		expect(() =>
			// @ts-expect-error unknown field
			render(db.select("user").orderBy({ nope: "asc" })),
		).toThrow(OrmError);
	});

	test("fluent API is unchanged", () => {
		const { sql } = render(
			db
				.select("user")
				.where((u) => u.age.gt(1))
				.orderBy("age"),
		);
		expect(sql).toContain("WHERE $this.age > ");
		expect(sql).toContain("ORDER BY age");
	});

	test("value types are checked", () => {
		// Never invoked; present only so `tsc` checks the @ts-expect-error cases.
		const _typeChecks = () => {
			// @ts-expect-error age is a number
			db.select("user").where({ age: "old" });
			// @ts-expect-error gt expects a number
			db.select("user").where({ age: { gt: "old" } });
			// @ts-expect-error inside expects an array
			db.select("user").where({ age: { inside: 1 } });
			// @ts-expect-error nested record field is typed
			db.select("user").where({ org: { size: "big" } });
			// @ts-expect-error unknown field inside a combinator
			db.select("user").where({ or: [{ nope: 1 }] });
			// @ts-expect-error direction must be asc/desc
			db.select("user").orderBy({ age: "sideways" });
			// @ts-expect-error nested sort keys are checked
			db.select("user").orderBy({ name: { nope: "asc" } });
			// OK forms
			db.select("user").where({ nick: "x", tags: { contains: "a" } });
			db.select("user").where({ manager: { manager: { age: 1 } } });
		};
		expect(_typeChecks).toBeDefined();
	});
});
