import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

describe("UPSERT queries", () => {
	const user = table("user", {
		name: t.string(),
		age: t.number(),
		email: t.string(),
	});

	const db = orm(new Surreal(), user);

	test("generates UPSERT with SET", () => {
		const query = db.upsert("user", "alice").set({
			name: "Alice",
			age: 30,
			email: "alice@example.com",
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPSERT");
		expect(result).toContain("SET");
	});

	test("generates UPSERT with CONTENT", () => {
		const query = db.upsert("user", "bob").content({
			name: "Bob",
			age: 35,
			email: "bob@example.com",
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPSERT");
		expect(result).toContain("CONTENT");
	});

	test("generates UPSERT with += operator", () => {
		const query = db.upsert("user", "alice").set({
			age: { "+=": 1 },
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPSERT");
		expect(result).toContain("age +=");
	});

	test("generates UPSERT with -= operator", () => {
		const query = db.upsert("user", "alice").set({
			age: { "-=": 1 },
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPSERT");
		expect(result).toContain("age -=");
	});

	test("generates UPSERT with MERGE", () => {
		const query = db.upsert("user", "alice").merge({
			email: "newemail@example.com",
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPSERT");
		expect(result).toContain("MERGE");
	});

	test("generates UPSERT with PATCH", () => {
		const query = db.upsert("user", "alice").patch([
			{ op: "add", path: "/age", value: 30 },
			{ op: "replace", path: "/email", value: "newemail@example.com" },
		]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPSERT");
		expect(result).toContain("PATCH");
	});

	test("generates UPSERT with REPLACE", () => {
		const query = db.upsert("user", "alice").replace({
			name: "Alice",
			age: 30,
			email: "alice@example.com",
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPSERT");
		expect(result).toContain("REPLACE");
	});

	test("generates UPSERT with RETURN", () => {
		const query = db.upsert("user", "alice").set({ age: 31 }).return("after");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPSERT");
		expect(result).toContain("RETURN AFTER");
	});

	test("generates UPSERT with array RETURN callback", () => {
		const query = db
			.upsert("user", "alice")
			.set({ age: 31 })
			.return((record) => [record.name, record.age]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPSERT");
		expect(result).toContain("RETURN");
		expect(result).toContain("[");
		expect(result).toContain("]");
	});

	test("generates UPSERT with TIMEOUT", () => {
		const query = db.upsert("user", "alice").set({ age: 31 }).timeout("10s");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPSERT");
		expect(result).toContain("TIMEOUT");
	});

	test("throws error when using both SET and CONTENT", () => {
		const query = db.upsert("user", "alice").set({ age: 30 });
		expect(() => query.content({ age: 31 })).toThrow();
	});

	test("throws error when using both SET and MERGE", () => {
		const query = db.upsert("user", "alice").set({ age: 30 });
		expect(() => query.merge({ email: "test@example.com" })).toThrow();
	});

	test("throws error when using both MERGE and PATCH", () => {
		const query = db.upsert("user", "alice").merge({ age: 30 });
		expect(() =>
			query.patch([{ op: "add", path: "/email", value: "test@example.com" }]),
		).toThrow();
	});

	test("throws error when using both PATCH and REPLACE", () => {
		const query = db
			.upsert("user", "alice")
			.patch([{ op: "add", path: "/age", value: 30 }]);
		expect(() =>
			query.replace({ name: "Test", age: 30, email: "test@example.com" }),
		).toThrow();
	});

	test("throws error when using both CONTENT and REPLACE", () => {
		const query = db.upsert("user", "alice").content({ age: 30 });
		expect(() =>
			query.replace({ name: "Test", age: 30, email: "test@example.com" }),
		).toThrow();
	});
});
