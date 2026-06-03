import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { edge, orm, t, table } from "../../../src";

// Compile-time equality assertion helper.
type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;

const user = table("user", {
	name: t.string(),
	email: t.string(),
	age: t.number(),
});
const post = table("post", { title: t.string() });
const authored = edge("user", "authored", "post", { created: t.date() });

describe("orm() schema input forms", () => {
	test("rest-param form registers tables keyed by table name", () => {
		const db = orm(new Surreal(), user, post, authored);

		expect(Object.keys(db.tables).sort()).toEqual(["authored", "post", "user"]);
	});

	test("object form registers the same tables and lookup as rest form", () => {
		const surreal = new Surreal();
		const dbRest = orm(surreal, user, post, authored);
		const dbObj = orm(surreal, { user, post, authored });

		expect(Object.keys(dbObj.tables).sort()).toEqual(
			Object.keys(dbRest.tables).sort(),
		);
		expect(dbObj.tables.user).toBe(dbRest.tables.user);
		expect(dbObj.lookup).toEqual(dbRest.lookup);
	});

	test("object form keys by table name, not by the object key", () => {
		// Deliberately use keys that differ from the table names.
		const db = orm(new Surreal(), { theUser: user, thePost: post });

		expect(db.tables).toHaveProperty("user");
		expect(db.tables).toHaveProperty("post");
		expect(db.tables).not.toHaveProperty("theUser");
		// Queries still address tables by their `tb` name.
		expect(db.select("user")).toBeDefined();
	});

	test("works with a namespace-style object (import * as schema)", () => {
		const schema = { user, post, authored };
		const db = orm(new Surreal(), schema);

		expect(Object.keys(db.tables).sort()).toEqual(["authored", "post", "user"]);
		expect(db.lookup.to.user).toContain("authored");
	});

	test("empty schema object produces an empty orm", () => {
		const db = orm(new Surreal(), {});

		expect(db.tables).toEqual({});
		expect(db.lookup).toEqual({ to: {}, from: {} });
	});
});

describe("orm() object form keeps full type support", () => {
	test("tables and lookup types match the rest-param form exactly", () => {
		const surreal = new Surreal();
		const dbRest = orm(surreal, user, post, authored);
		const dbObj = orm(surreal, { user, post, authored });

		const sameTables: Equal<typeof dbRest.tables, typeof dbObj.tables> = true;
		const sameLookup: Equal<typeof dbRest.lookup, typeof dbObj.lookup> = true;

		expect(sameTables).toBe(true);
		expect(sameLookup).toBe(true);
	});

	test("graph lookup stays precisely typed", () => {
		const db = orm(new Surreal(), { user, post, authored });

		// Exact tuple types — a wider inference (e.g. `readonly string[]` or
		// `readonly []`) would fail to type-check here.
		const toUser: readonly ["authored"] = db.lookup.to.user;
		const toAuthored: readonly ["post"] = db.lookup.to.authored;
		const fromPost: readonly ["authored"] = db.lookup.from.post;

		expect(toUser).toEqual(["authored"]);
		expect(toAuthored).toEqual(["post"]);
		expect(fromPost).toEqual(["authored"]);
	});

	test("query building and result inference work through the object form", () => {
		const db = orm(new Surreal(), { user, post, authored });

		const query = db
			.select("user")
			.where((u) => u.age.gte(18))
			.return((u) => ({ name: u.name, email: u.email }));

		type Result = t.infer<typeof query>;
		const sample: Result = [{ name: "Alice", email: "alice@example.com" }];

		expect(sample[0]?.name).toBe("Alice");
	});
});
