import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import { __display, displayContext, edge, orm, t, table } from "../../../src";

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
