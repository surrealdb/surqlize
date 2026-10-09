import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import { __display, displayContext, edge, orm, t, table } from "../../../src";

type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;

describe("RELATE queries", () => {
	const user = table("user", {
		name: t.string(),
	});

	const post = table("post", {
		title: t.string(),
	});

	const authored = edge("user", "authored", "post", {
		created: t.date(),
	});

	const db = orm(new Surreal(), user, post, authored);

	test("generates RELATE with single from and to", () => {
		const query = db.relate(
			"authored",
			new RecordId("user", "alice"),
			new RecordId("post", "post1"),
		);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RELATE");
		expect(result).toContain("->");
		// Table name is in variables
	});

	test("generates RELATE with SET", () => {
		const query = db
			.relate(
				"authored",
				new RecordId("user", "alice"),
				new RecordId("post", "post1"),
			)
			.set({
				created: new Date("2024-01-01"),
			});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RELATE");
		expect(result).toContain("SET");
	});

	test("generates RELATE with CONTENT", () => {
		const query = db
			.relate(
				"authored",
				new RecordId("user", "alice"),
				new RecordId("post", "post1"),
			)
			.content({
				created: new Date("2024-01-01"),
			});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RELATE");
		expect(result).toContain("CONTENT");
	});

	test("generates RELATE with multiple from records", () => {
		const query = db.relate(
			"authored",
			[new RecordId("user", "alice"), new RecordId("user", "bob")],
			new RecordId("post", "post1"),
		);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RELATE");
	});

	test("generates RELATE with multiple to records", () => {
		const query = db.relate("authored", new RecordId("user", "alice"), [
			new RecordId("post", "post1"),
			new RecordId("post", "post2"),
		]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RELATE");
	});

	test("generates RELATE with cartesian product", () => {
		const query = db.relate(
			"authored",
			[new RecordId("user", "alice"), new RecordId("user", "bob")],
			[new RecordId("post", "post1"), new RecordId("post", "post2")],
		);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RELATE");
	});

	test("generates RELATE with RETURN", () => {
		const query = db
			.relate(
				"authored",
				new RecordId("user", "alice"),
				new RecordId("post", "post1"),
			)
			.set({ created: new Date() })
			.return("after");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RELATE");
		expect(result).toContain("RETURN AFTER");
	});

	test("generates RELATE with RETURN callback", () => {
		const query = db
			.relate(
				"authored",
				new RecordId("user", "alice"),
				new RecordId("post", "post1"),
			)
			.return((edge) => ({
				from: edge.in,
				to: edge.out,
			}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RELATE");
		expect(result).toContain("RETURN");
	});

	test("generates RELATE with array RETURN callback", () => {
		const query = db
			.relate(
				"authored",
				new RecordId("user", "alice"),
				new RecordId("post", "post1"),
			)
			.return((edge) => [edge.in, edge.out]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RELATE");
		expect(result).toContain("RETURN");
		expect(result).toContain("[");
		expect(result).toContain("]");
	});

	test("generates RELATE with TIMEOUT", () => {
		const query = db
			.relate(
				"authored",
				new RecordId("user", "alice"),
				new RecordId("post", "post1"),
			)
			.timeout("5s");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RELATE");
		expect(result).toContain("TIMEOUT");
	});

	test("generates RELATE with MERGE", () => {
		const query = db
			.relate(
				"authored",
				new RecordId("user", "alice"),
				new RecordId("post", "post1"),
			)
			.merge({
				created: new Date("2024-01-01"),
			});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RELATE");
		expect(result).toContain("MERGE");
	});

	test("generates RELATE with PATCH", () => {
		const query = db
			.relate(
				"authored",
				new RecordId("user", "alice"),
				new RecordId("post", "post1"),
			)
			.patch([{ op: "add", path: "/created", value: new Date("2024-01-01") }]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RELATE");
		expect(result).toContain("PATCH");
	});

	test("generates RELATE with REPLACE", () => {
		const query = db
			.relate(
				"authored",
				new RecordId("user", "alice"),
				new RecordId("post", "post1"),
			)
			.replace({
				created: new Date("2024-01-01"),
			});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RELATE");
		expect(result).toContain("REPLACE");
	});

	test("throws error when using both SET and CONTENT", () => {
		const query = db
			.relate(
				"authored",
				new RecordId("user", "alice"),
				new RecordId("post", "post1"),
			)
			.set({ created: new Date() });
		expect(() => query.content({ created: new Date() })).toThrow();
	});

	test("throws error when using both SET and MERGE", () => {
		const query = db
			.relate(
				"authored",
				new RecordId("user", "alice"),
				new RecordId("post", "post1"),
			)
			.set({ created: new Date() });
		expect(() => query.merge({ created: new Date() })).toThrow();
	});

	test("throws error when using both CONTENT and PATCH", () => {
		const query = db
			.relate(
				"authored",
				new RecordId("user", "alice"),
				new RecordId("post", "post1"),
			)
			.content({ created: new Date() });
		expect(() =>
			query.patch([{ op: "add", path: "/created", value: new Date() }]),
		).toThrow();
	});

	test("throws error when using both MERGE and REPLACE", () => {
		const query = db
			.relate(
				"authored",
				new RecordId("user", "alice"),
				new RecordId("post", "post1"),
			)
			.merge({ created: new Date() });
		expect(() => query.replace({ created: new Date() })).toThrow();
	});
});

describe("RELATE content typing", () => {
	const user = table("user", { name: t.string() });
	const knows = edge("user", "knows", "user", {
		since: t.number(),
		note: t.string().default(""),
		tag: t.option(t.string()),
	});
	const db = orm(new Surreal(), user, knows);
	const a = new RecordId("user", 1);
	const b = new RecordId("user", 2);

	test("follows the optionality rules of create().content()", () => {
		const q = db.relate("knows", a, b);
		type Content = Parameters<typeof q.content>[0];
		// `in`, `out` and `id` are supplied by RELATE; defaults and options are optional.
		const _shape: Equal<
			{ [K in keyof Content]: Content[K] },
			{ since: number; note?: string; tag?: string | undefined }
		> = true;
		expect(_shape).toBe(true);

		const ctx = displayContext();
		const sql = db.relate("knows", a, b).content({ since: 1 })[__display](ctx);
		expect(sql).toContain("CONTENT");
		db.relate("knows", a, b).content({ since: 1, note: "hi", tag: "x" });
	});

	test("still requires fields without a default", () => {
		// @ts-expect-error `since` is required
		db.relate("knows", a, b).content({ note: "hi" });
		// @ts-expect-error `in` and `out` are supplied by RELATE
		db.relate("knows", a, b).content({ since: 1, in: a });
		expect(true).toBe(true);
	});
});

describe("RELATE endpoints from queries", () => {
	const user = table("user", { name: t.string() });
	const post = table("post", { title: t.string() });
	const authored = edge("user", "authored", "post", { created: t.date() });
	const db = orm(new Surreal(), user, post, authored);

	test("a select of rows, or a single row, is an endpoint", () => {
		// Type-level: these compile. The function is never called.
		const _usersToPost = () =>
			db.relate("authored", db.select("user"), db.select("post", "p1"));
		const _singleToSingle = () =>
			db.relate(
				"authored",
				db.select("user", "alice").only(),
				db.select("post").only(),
			);
		const _projectedId = () =>
			db.relate(
				"authored",
				db.select("user").return((u) => ({ id: u.id })),
				db.select("post"),
			);
		expect(typeof _usersToPost).toBe("function");
		expect(typeof _singleToSingle).toBe("function");
		expect(typeof _projectedId).toBe("function");
	});

	test("renders the query as a subquery on each side", () => {
		const sql = db
			.relate("authored", db.select("user", "alice"), db.select("post", "p1"))
			[__display](displayContext());

		expect(sql).toContain("RELATE (SELECT * FROM");
		expect(sql).toContain(")->");
		expect(sql).toContain("->(SELECT * FROM");
	});

	test("a query whose rows have no id is rejected", () => {
		const nameOnly = db.select("user").return((u) => ({ name: u.name }));
		// @ts-expect-error a row without an id is not a record, so it cannot be an endpoint
		db.relate("authored", nameOnly, db.select("post"));
		expect(true).toBe(true);
	});
});
