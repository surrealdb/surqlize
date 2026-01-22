import { describe, expect, test } from "bun:test";
import { RecordId, Surreal, Table } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

describe("SELECT queries", () => {
	const user = table("user", {
		name: t.string(),
		age: t.number(),
		email: t.string(),
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
});
