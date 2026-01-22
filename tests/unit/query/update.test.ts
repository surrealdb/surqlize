import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

describe("UPDATE queries", () => {
	const user = table("user", {
		name: t.string(),
		age: t.number(),
		email: t.string(),
	});

	const db = orm(new Surreal(), user);

	test("generates bulk UPDATE with SET", () => {
		const query = db.update("user").set({
			age: 30,
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("SET");
		expect(result).toContain("age =");
	});

	test("generates UPDATE with WHERE", () => {
		const query = db
			.update("user")
			.where(($this) => $this.age.lt(18))
			.set({ age: 18 });
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("WHERE");
		expect(result).toContain("SET");
	});

	test("generates UPDATE with specific ID", () => {
		const query = db.update("user", "alice").set({
			age: 31,
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("SET");
		// ID is in variables, not in the query string directly
	});

	test("generates UPDATE with += operator", () => {
		const query = db.update("user", "alice").set({
			age: { "+=": 1 },
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("age +=");
	});

	test("generates UPDATE with -= operator", () => {
		const query = db.update("user", "alice").set({
			age: { "-=": 1 },
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("age -=");
	});

	test("generates UPDATE with MERGE", () => {
		const query = db.update("user", "alice").merge({
			email: "newemail@example.com",
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("MERGE");
	});

	test("generates UPDATE with PATCH", () => {
		const query = db.update("user", "alice").patch([
			{ op: "add", path: "/age", value: 30 },
			{ op: "replace", path: "/email", value: "newemail@example.com" },
		]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("PATCH");
	});

	test("generates UPDATE with REPLACE", () => {
		const query = db.update("user", "alice").replace({
			name: "Alice",
			age: 30,
			email: "alice@example.com",
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("REPLACE");
	});

	test("generates UPDATE with RETURN after", () => {
		const query = db.update("user", "alice").set({ age: 32 }).return("after");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("RETURN AFTER");
	});

	test("generates UPDATE with RETURN before", () => {
		const query = db.update("user", "alice").set({ age: 32 }).return("before");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("RETURN BEFORE");
	});

	test("generates UPDATE with RETURN diff", () => {
		const query = db.update("user", "alice").set({ age: 32 }).return("diff");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("RETURN DIFF");
	});

	test("generates UPDATE with RETURN callback", () => {
		const query = db
			.update("user", "alice")
			.set({ age: 32 })
			.return((record) => record.name);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("RETURN");
	});

	test("generates UPDATE with TIMEOUT", () => {
		const query = db.update("user", "alice").set({ age: 32 }).timeout("10s");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("TIMEOUT");
	});

	test("throws error when using both SET and MERGE", () => {
		const query = db.update("user", "alice").set({ age: 30 });
		expect(() => query.merge({ email: "test@example.com" })).toThrow();
	});

	test("throws error when using both MERGE and PATCH", () => {
		const query = db.update("user", "alice").merge({ age: 30 });
		expect(() =>
			query.patch([{ op: "add", path: "/email", value: "test@example.com" }]),
		).toThrow();
	});

	test("throws error when using both PATCH and REPLACE", () => {
		const query = db
			.update("user", "alice")
			.patch([{ op: "add", path: "/age", value: 30 }]);
		expect(() =>
			query.replace({ name: "Test", age: 30, email: "test@example.com" }),
		).toThrow();
	});

	test("throws error when using both CONTENT and REPLACE", () => {
		const query = db.update("user", "alice").content({ age: 30 });
		expect(() =>
			query.replace({ name: "Test", age: 30, email: "test@example.com" }),
		).toThrow();
	});
});
