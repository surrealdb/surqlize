import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

describe("CREATE queries", () => {
	const user = table("user", {
		name: t.string(),
		age: t.number(),
		email: t.string(),
	});

	const db = orm(new Surreal(), user);

	test("generates CREATE with SET", () => {
		const query = db.create("user").set({
			name: "John",
			age: 30,
			email: "john@example.com",
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		expect(result).toContain("SET");
		expect(result).toContain("name =");
		expect(result).toContain("age =");
		expect(result).toContain("email =");
	});

	test("generates CREATE with specific ID", () => {
		const query = db.create("user", "alice").set({
			name: "Alice",
			age: 25,
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		expect(result).toContain("SET");
		// ID is in variables, not in the query string directly
	});

	test("generates CREATE with CONTENT", () => {
		const query = db.create("user").content({
			name: "Bob",
			age: 35,
			email: "bob@example.com",
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		expect(result).toContain("CONTENT");
	});

	test("generates CREATE with RETURN", () => {
		const query = db
			.create("user")
			.set({
				name: "Charlie",
				age: 40,
			})
			.return("after");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		expect(result).toContain("RETURN AFTER");
	});

	test("generates CREATE with RETURN callback", () => {
		const query = db
			.create("user")
			.set({
				name: "Dave",
				age: 45,
			})
			.return((record) => record.name);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		// RETURN with callback generates a different format
	});

	test("generates CREATE with array RETURN callback", () => {
		const query = db
			.create("user")
			.set({
				name: "Eve",
				age: 50,
			})
			.return((record) => [record.name, record.age]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		expect(result).toContain("RETURN");
		expect(result).toContain("[");
		expect(result).toContain("]");
	});

	test("generates CREATE with += operator", () => {
		const query = db.create("user").set({
			name: "Eve",
			age: { "+=": 1 },
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		expect(result).toContain("age +=");
	});

	test("generates CREATE with -= operator", () => {
		const query = db.create("user").set({
			name: "Frank",
			age: { "-=": 1 },
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		expect(result).toContain("age -=");
	});

	test("generates CREATE with TIMEOUT", () => {
		const query = db
			.create("user")
			.set({
				name: "Grace",
				age: 50,
			})
			.timeout("5s");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		expect(result).toContain("TIMEOUT");
	});

	test("generates CREATE with MERGE", () => {
		const query = db.create("user").merge({
			email: "newemail@example.com",
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		expect(result).toContain("MERGE");
	});

	test("generates CREATE with PATCH", () => {
		const query = db.create("user").patch([
			{ op: "add", path: "/name", value: "John" },
			{ op: "replace", path: "/age", value: 30 },
		]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		expect(result).toContain("PATCH");
	});

	test("generates CREATE with REPLACE", () => {
		const query = db.create("user").replace({
			name: "Replaced",
			age: 99,
			email: "replaced@example.com",
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		expect(result).toContain("REPLACE");
	});

	test("throws error when using both SET and CONTENT", () => {
		const query = db.create("user").set({ name: "Test" });
		expect(() =>
			query.content({ name: "Test2", age: 30, email: "test@test.com" }),
		).toThrow();
	});

	test("throws error when using both SET and MERGE", () => {
		const query = db.create("user").set({ name: "Test" });
		expect(() => query.merge({ email: "test@example.com" })).toThrow();
	});

	test("throws error when using both CONTENT and MERGE", () => {
		const query = db
			.create("user")
			.content({ name: "Test", age: 30, email: "test@test.com" });
		expect(() => query.merge({ email: "test@example.com" })).toThrow();
	});

	test("throws error when using both MERGE and PATCH", () => {
		const query = db.create("user").merge({ name: "Test" });
		expect(() =>
			query.patch([{ op: "add", path: "/age", value: 30 }]),
		).toThrow();
	});

	test("throws error when using both PATCH and REPLACE", () => {
		const query = db
			.create("user")
			.patch([{ op: "add", path: "/age", value: 30 }]);
		expect(() =>
			query.replace({ name: "Test", age: 30, email: "test@test.com" }),
		).toThrow();
	});

	test("generates CREATE with partial fields", () => {
		const query = db.create("user").set({
			name: "Henry",
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		expect(result).toContain("SET");
		expect(result).toContain("name =");
		expect(result).not.toContain("age =");
	});
});
