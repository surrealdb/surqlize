import { describe, expect, test } from "bun:test";
import { RecordId, Surreal, Table } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

describe("SELECT queries", () => {
	const user = table("user", {
		name: t.object({
			first: t.string(),
			last: t.string(),
		}),
		age: t.number(),
		email: t.string(),
		tags: t.array(t.string()),
	});

	const post = table("post", {
		title: t.string(),
		body: t.string(),
		author: t.record("user"),
	});

	const db = orm(new Surreal(), user, post);

	test("generates basic SELECT", () => {
		const query = db.select("user");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT * FROM");
		expect(Object.values(ctx.variables)).toContainEqual(new Table("user"));
	});

	test("generates SELECT with WHERE", () => {
		const query = db.select("user").where(($this) => $this.age.gt(18));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT * FROM");
		expect(result).toContain("WHERE");
		expect(result).toContain(">");
	});

	test("generates SELECT with LIMIT", () => {
		const query = db.select("user").limit(10);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT * FROM");
		expect(result).toContain("LIMIT");
	});

	test("generates SELECT with START", () => {
		const query = db.select("user").start(5);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT * FROM");
		expect(result).toContain("START");
	});

	test("generates SELECT with START and LIMIT", () => {
		const query = db.select("user").start(10).limit(20);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT * FROM");
		expect(result).toContain("START");
		expect(result).toContain("LIMIT");
	});

	test("generates SELECT with return projection", () => {
		const query = db.select("user").return((user) => ({
			name: user.name,
			email: user.email,
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT VALUE");
		expect(result).toContain("FROM");
	});

	test("generates SELECT with WHERE and return", () => {
		const query = db
			.select("user")
			.where(($this) => $this.age.gt(18))
			.return((user) => ({
				name: user.name,
			}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT VALUE");
		expect(result).toContain("WHERE");
	});

	test("generates nested SELECT", () => {
		const query = db.select("post").return((post) => ({
			title: post.title,
			author: post.author.select().return((author) => ({
				name: author.name,
			})),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT VALUE");
		expect(result).toContain("SELECT VALUE");
		expect(result).toContain("FROM");
	});

	test("generates SELECT with complex WHERE conditions", () => {
		const query = db
			.select("user")
			.where(($this) => $this.age.gt(18).and($this.age.lt(65)));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("WHERE");
		expect(result).toContain("AND");
	});

	test("generates SELECT one record by RecordId", () => {
		const recordId = new RecordId("user", "alice");
		const query = db.select(recordId);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT");
		expect(result).toContain("FROM");
	});

	test("generates SELECT one with return projection", () => {
		const recordId = new RecordId("user", "alice");
		const query = db.select(recordId).return((user) => ({
			name: user.name,
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT");
	});

	test("generates SELECT with TIMEOUT", () => {
		const query = db.select("user").timeout("5s");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT * FROM");
		expect(result).toContain("TIMEOUT");
		expect(Object.values(ctx.variables)).toContainEqual("5s");
	});

	test("generates SELECT with WHERE, LIMIT and TIMEOUT", () => {
		const query = db
			.select("user")
			.where(($this) => $this.age.gt(18))
			.limit(10)
			.timeout("10s");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT * FROM");
		expect(result).toContain("WHERE");
		expect(result).toContain("LIMIT");
		expect(result).toContain("TIMEOUT");
	});
});

describe("SELECT ORDER BY", () => {
	const user = table("user", {
		name: t.object({
			first: t.string(),
			last: t.string(),
		}),
		age: t.number(),
		email: t.string(),
	});

	const db = orm(new Surreal(), user);

	test("generates ORDER BY with string field ASC", () => {
		const query = db.select("user").orderBy("age", "ASC");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("ORDER BY age ASC");
	});

	test("generates ORDER BY with string field DESC", () => {
		const query = db.select("user").orderBy("age", "DESC");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("ORDER BY age DESC");
	});

	test("generates ORDER BY without explicit direction", () => {
		const query = db.select("user").orderBy("age");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("ORDER BY age");
		expect(result).not.toContain("ASC");
		expect(result).not.toContain("DESC");
	});

	test("generates ORDER BY with callback for nested fields", () => {
		const query = db.select("user").orderBy((user) => user.name.last, "ASC");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("ORDER BY");
		expect(result).toContain('["name"]["last"]');
		expect(result).toContain("ASC");
	});

	test("generates ORDER BY with multiple fields", () => {
		const query = db
			.select("user")
			.orderBy((user) => user.name.last, "ASC")
			.orderBy((user) => user.name.first, "ASC");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("ORDER BY");
		expect(result).toContain('["name"]["last"] ASC');
		expect(result).toContain('["name"]["first"] ASC');
		// Both should be in a single ORDER BY clause separated by comma
		expect(result).toMatch(/ORDER BY .+, .+/);
	});

	test("generates ORDER BY NUMERIC", () => {
		const query = db.select("user").orderByNumeric("age", "DESC");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("ORDER BY age NUMERIC DESC");
	});

	test("generates ORDER BY NUMERIC without direction", () => {
		const query = db.select("user").orderByNumeric("age");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("ORDER BY age NUMERIC");
		expect(result).not.toContain("ASC");
		expect(result).not.toContain("DESC");
	});

	test("generates ORDER BY COLLATE", () => {
		const query = db.select("user").orderByCollate("email", "ASC");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("ORDER BY email COLLATE ASC");
	});

	test("generates ORDER BY COLLATE without direction", () => {
		const query = db.select("user").orderByCollate("email");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("ORDER BY email COLLATE");
		expect(result).not.toContain("ASC");
		expect(result).not.toContain("DESC");
	});

	test("generates ORDER BY with mixed types", () => {
		const query = db
			.select("user")
			.orderByCollate("email", "ASC")
			.orderByNumeric("age", "DESC");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("ORDER BY email COLLATE ASC, age NUMERIC DESC");
	});

	test("generates ORDER BY with callback and NUMERIC", () => {
		const query = db.select("user").orderByNumeric((user) => user.age, "DESC");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("ORDER BY");
		expect(result).toContain("NUMERIC DESC");
	});
});

describe("SELECT GROUP BY", () => {
	const user = table("user", {
		name: t.string(),
		age: t.number(),
		email: t.string(),
	});

	const db = orm(new Surreal(), user);

	test("generates GROUP BY with single field", () => {
		const query = db.select("user").groupBy("email");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("GROUP BY email");
	});

	test("generates GROUP BY with multiple fields", () => {
		const query = db.select("user").groupBy("email", "age");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("GROUP BY email, age");
	});

	test("generates GROUP ALL", () => {
		const query = db.select("user").groupAll();
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("GROUP ALL");
		expect(result).not.toContain("GROUP BY");
	});

	test("groupAll overrides previous groupBy", () => {
		const query = db.select("user").groupBy("email").groupAll();
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("GROUP ALL");
		expect(result).not.toContain("GROUP BY");
	});

	test("groupBy overrides previous groupAll", () => {
		const query = db.select("user").groupAll().groupBy("email");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("GROUP BY email");
		expect(result).not.toContain("GROUP ALL");
	});
});

describe("SELECT SPLIT", () => {
	const user = table("user", {
		name: t.string(),
		tags: t.array(t.string()),
		scores: t.array(t.number()),
	});

	const db = orm(new Surreal(), user);

	test("generates SPLIT with single field", () => {
		const query = db.select("user").split("tags");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SPLIT tags");
	});

	test("generates SPLIT with multiple fields", () => {
		const query = db.select("user").split("tags", "scores");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SPLIT tags, scores");
	});
});

describe("SELECT FETCH", () => {
	const user = table("user", {
		name: t.string(),
	});

	const post = table("post", {
		title: t.string(),
		author: t.record("user"),
	});

	const db = orm(new Surreal(), user, post);

	test("generates FETCH with single field", () => {
		const query = db.select("post").fetch("author");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("FETCH author");
	});

	test("generates FETCH with multiple fields", () => {
		const query = db.select("post").fetch("author", "title");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("FETCH author, title");
	});

	test("generates FETCH with nested paths", () => {
		const query = db.select("post").fetch("author.profile");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("FETCH author.profile");
	});
});

describe("SELECT clause ordering", () => {
	const user = table("user", {
		name: t.string(),
		age: t.number(),
		email: t.string(),
		tags: t.array(t.string()),
	});

	const db = orm(new Surreal(), user);

	test("emits clauses in correct SurrealQL order", () => {
		const query = db
			.select("user")
			.where(($this) => $this.age.gte(18))
			.split("tags")
			.groupBy("email")
			.orderBy("age", "DESC")
			.start(10)
			.limit(20)
			.fetch("tags")
			.timeout("5s");
		const ctx = displayContext();
		const result = query[__display](ctx);

		// Verify all clauses are present
		expect(result).toContain("WHERE");
		expect(result).toContain("SPLIT tags");
		expect(result).toContain("GROUP BY email");
		expect(result).toContain("ORDER BY age DESC");
		expect(result).toContain("START");
		expect(result).toContain("LIMIT");
		expect(result).toContain("FETCH tags");
		expect(result).toContain("TIMEOUT");

		// Verify correct ordering: WHERE < SPLIT < GROUP < ORDER < LIMIT < START < FETCH < TIMEOUT
		const whereIdx = result.indexOf("WHERE");
		const splitIdx = result.indexOf("SPLIT");
		const groupIdx = result.indexOf("GROUP BY");
		const orderIdx = result.indexOf("ORDER BY");
		const startIdx = result.indexOf("START");
		const limitIdx = result.indexOf("LIMIT");
		const fetchIdx = result.indexOf("FETCH");
		const timeoutIdx = result.indexOf("TIMEOUT");

		expect(whereIdx).toBeLessThan(splitIdx);
		expect(splitIdx).toBeLessThan(groupIdx);
		expect(groupIdx).toBeLessThan(orderIdx);
		expect(orderIdx).toBeLessThan(limitIdx);
		expect(limitIdx).toBeLessThan(startIdx);
		expect(startIdx).toBeLessThan(fetchIdx);
		expect(fetchIdx).toBeLessThan(timeoutIdx);
	});

	test("ORDER BY comes after WHERE when no SPLIT/GROUP", () => {
		const query = db
			.select("user")
			.where(($this) => $this.age.gt(18))
			.orderBy("age", "DESC");
		const ctx = displayContext();
		const result = query[__display](ctx);

		const whereIdx = result.indexOf("WHERE");
		const orderIdx = result.indexOf("ORDER BY");
		expect(whereIdx).toBeLessThan(orderIdx);
	});

	test("FETCH comes after LIMIT", () => {
		const query = db.select("user").limit(10).fetch("tags");
		const ctx = displayContext();
		const result = query[__display](ctx);

		const limitIdx = result.indexOf("LIMIT");
		const fetchIdx = result.indexOf("FETCH");
		expect(limitIdx).toBeLessThan(fetchIdx);
	});

	test("TIMEOUT is always last", () => {
		const query = db
			.select("user")
			.timeout("5s")
			.orderBy("age", "DESC")
			.fetch("tags");
		const ctx = displayContext();
		const result = query[__display](ctx);

		const timeoutIdx = result.indexOf("TIMEOUT");
		const orderIdx = result.indexOf("ORDER BY");
		const fetchIdx = result.indexOf("FETCH");
		expect(orderIdx).toBeLessThan(fetchIdx);
		expect(fetchIdx).toBeLessThan(timeoutIdx);
	});

	test("methods can be called in any order", () => {
		// Call methods in reverse order — output should still be correct
		const query = db
			.select("user")
			.timeout("5s")
			.fetch("tags")
			.limit(20)
			.start(10)
			.orderBy("age", "DESC")
			.groupBy("email")
			.split("tags")
			.where(($this) => $this.age.gte(18));
		const ctx = displayContext();
		const result = query[__display](ctx);

		const whereIdx = result.indexOf("WHERE");
		const splitIdx = result.indexOf("SPLIT");
		const groupIdx = result.indexOf("GROUP BY");
		const orderIdx = result.indexOf("ORDER BY");
		const startIdx = result.indexOf("START");
		const limitIdx = result.indexOf("LIMIT");
		const fetchIdx = result.indexOf("FETCH");
		const timeoutIdx = result.indexOf("TIMEOUT");

		expect(whereIdx).toBeLessThan(splitIdx);
		expect(splitIdx).toBeLessThan(groupIdx);
		expect(groupIdx).toBeLessThan(orderIdx);
		expect(orderIdx).toBeLessThan(limitIdx);
		expect(limitIdx).toBeLessThan(startIdx);
		expect(startIdx).toBeLessThan(fetchIdx);
		expect(fetchIdx).toBeLessThan(timeoutIdx);
	});

	test("omits absent clauses cleanly", () => {
		const query = db.select("user").orderBy("age", "DESC").limit(10);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).not.toContain("WHERE");
		expect(result).not.toContain("SPLIT");
		expect(result).not.toContain("GROUP");
		expect(result).not.toContain("FETCH");
		expect(result).not.toContain("TIMEOUT");
		expect(result).toContain("ORDER BY age DESC");
		expect(result).toContain("LIMIT");
	});
});
