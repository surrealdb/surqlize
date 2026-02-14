import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import {
	__display,
	displayContext,
	OrmError,
	orm,
	t,
	table,
} from "../../../src";

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

	test("generates INSERT with array RETURN callback", () => {
		const query = db
			.insert("user", {
				name: "Eve",
				age: 50,
				email: "eve@example.com",
			})
			.return((record) => [record.name, record.age]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("INSERT");
		expect(result).toContain("RETURN");
		expect(result).toContain("[");
		expect(result).toContain("]");
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

	describe("validation errors", () => {
		test("fields() throws OrmError when data was passed to constructor", () => {
			const query = db.insert("user", {
				name: "Alice",
				age: 25,
				email: "a@b.com",
			});
			expect(() => query.fields(["name", "age"])).toThrow(
				"Cannot use fields() with object-style insert",
			);

			try {
				query.fields(["name"]);
			} catch (err) {
				expect(err).toBeInstanceOf(OrmError);
			}
		});

		test("values() throws OrmError when data was passed to constructor", () => {
			const query = db.insert("user", {
				name: "Alice",
				age: 25,
				email: "a@b.com",
			});
			// Need to bypass the fields check by testing data check first
			expect(() => query.values(["Alice", 25])).toThrow(
				"Cannot use values() with object-style insert",
			);

			try {
				query.values(["Alice", 25]);
			} catch (err) {
				expect(err).toBeInstanceOf(OrmError);
			}
		});

		test("values() throws OrmError when fields() has not been called", () => {
			const query = db.insert("user");
			expect(() => query.values(["Alice", 25])).toThrow(
				"Must call fields() before values()",
			);

			try {
				db.insert("user").values(["Alice", 25]);
			} catch (err) {
				expect(err).toBeInstanceOf(OrmError);
			}
		});

		test("values() throws OrmError when row length mismatches field count", () => {
			const query = db.insert("user").fields(["name", "age"]);
			expect(() => query.values(["Alice"])).toThrow(
				"Value row length (1) does not match fields length (2)",
			);

			try {
				db.insert("user").fields(["name", "age"]).values(["Alice"]);
			} catch (err) {
				expect(err).toBeInstanceOf(OrmError);
			}
		});

		test("ignore() throws OrmError after onDuplicate()", () => {
			const query = db
				.insert("user", { name: "Alice", age: 25, email: "a@b.com" })
				.onDuplicate({ age: { "+=": 1 } });
			expect(() => query.ignore()).toThrow(
				"Cannot use both ignore() and onDuplicate()",
			);

			try {
				query.ignore();
			} catch (err) {
				expect(err).toBeInstanceOf(OrmError);
			}
		});

		test("onDuplicate() throws OrmError after ignore()", () => {
			const query = db
				.insert("user", { name: "Alice", age: 25, email: "a@b.com" })
				.ignore();
			expect(() => query.onDuplicate({ age: { "+=": 1 } })).toThrow(
				"Cannot use both ignore() and onDuplicate()",
			);

			try {
				query.onDuplicate({ age: { "+=": 1 } });
			} catch (err) {
				expect(err).toBeInstanceOf(OrmError);
			}
		});
	});
});
