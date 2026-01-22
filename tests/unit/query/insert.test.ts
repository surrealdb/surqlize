import { describe, expect, test } from "bun:test";
import Surreal from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

describe("INSERT queries", () => {
	const user = table("user", {
		name: t.string(),
		age: t.number(),
		email: t.string(),
	});

	const db = orm(new Surreal(), user);

	test("generates INSERT with single record", () => {
		const query = db.insert("user", {
			name: "John",
			age: 30,
			email: "john@example.com",
		});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("INSERT INTO");
	});

	test("generates INSERT with multiple records", () => {
		const query = db.insert("user", [
			{ name: "Alice", age: 25, email: "alice@example.com" },
			{ name: "Bob", age: 35, email: "bob@example.com" },
		]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("INSERT INTO");
	});

	test("generates INSERT with fields and values", () => {
		const query = db
			.insert("user")
			.fields(["name", "age"])
			.values(["Alice", 25], ["Bob", 35]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("INSERT INTO");
	});

	test("generates INSERT with IGNORE", () => {
		const query = db
			.insert("user", {
				name: "Charlie",
				age: 40,
				email: "charlie@example.com",
			})
			.ignore();
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("INSERT");
		expect(result).toContain("IGNORE");
	});

	test("generates INSERT with ON DUPLICATE KEY UPDATE", () => {
		const query = db
			.insert("user", {
				name: "Dave",
				age: 45,
				email: "dave@example.com",
			})
			.onDuplicate({
				age: { "+=": 1 },
			});
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("INSERT");
		expect(result).toContain("ON DUPLICATE KEY UPDATE");
	});

	test("generates INSERT with RETURN", () => {
		const query = db
			.insert("user", {
				name: "Eve",
				age: 50,
				email: "eve@example.com",
			})
			.return("after");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("INSERT");
		expect(result).toContain("RETURN AFTER");
	});

	test("generates INSERT with TIMEOUT", () => {
		const query = db
			.insert("user", {
				name: "Frank",
				age: 55,
				email: "frank@example.com",
			})
			.timeout("5s");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("INSERT");
		expect(result).toContain("TIMEOUT");
	});
});
