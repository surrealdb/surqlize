import { describe, expect, test } from "bun:test";
import { Surreal, Table } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

describe("LIVE SELECT queries", () => {
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

	test("generates basic LIVE SELECT", () => {
		const query = db.live("user");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("LIVE SELECT * FROM");
		expect(Object.values(ctx.variables)).toContainEqual(new Table("user"));
	});

	test("generates LIVE SELECT with WHERE", () => {
		const query = db.live("user").where(($this) => $this.age.gt(18));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("LIVE SELECT * FROM");
		expect(result).toContain("WHERE");
		expect(result).toContain(">");
	});

	test("generates LIVE SELECT DIFF", () => {
		const query = db.live("user").diff();
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("LIVE SELECT DIFF FROM");
	});

	test("generates LIVE SELECT with VALUE projection via return", () => {
		const query = db.live("user").return(($this) => ({
			name: $this.name,
			email: $this.email,
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("LIVE SELECT VALUE");
		expect(result).toContain("email");
	});

	test("generates LIVE SELECT with FETCH", () => {
		const query = db.live("post").fetch("author");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("LIVE SELECT * FROM");
		expect(result).toContain("FETCH author");
	});

	test("combines WHERE and FETCH", () => {
		const query = db
			.live("post")
			.where(($this) => $this.title.contains("hello"))
			.fetch("author");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("LIVE SELECT * FROM");
		expect(result).toContain("WHERE");
		expect(result).toContain("FETCH author");
	});

	test("does not emit clauses unsupported by LIVE SELECT", () => {
		const query = db.live("user").where(($this) => $this.age.gte(18));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).not.toContain("LIMIT");
		expect(result).not.toContain("START");
		expect(result).not.toContain("ORDER BY");
		expect(result).not.toContain("GROUP");
	});
});
