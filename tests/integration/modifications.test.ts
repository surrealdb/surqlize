import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { withTestDb } from "./setup";

describe("Modification methods integration tests", () => {
	const getTestDb = withTestDb({ perTest: true });

	describe("CONTENT", () => {
		test("creates a record with CONTENT", async () => {
			const { db } = getTestDb();
			const result = await db
				.create("user", "content_test")
				.content({
					name: { first: "Content", last: "User" },
					age: 25,
					email: "content@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			expect(result[0]!.name.first).toBe("Content");
			expect(result[0]!.age).toBe(25);
		});
	});

	describe("MERGE", () => {
		test("partially updates a record with MERGE", async () => {
			const { db } = getTestDb();

			// Create first
			await db
				.create("user", "merge_test")
				.set({
					name: { first: "Original", last: "User" },
					age: 30,
					email: "original@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			// Then merge
			const result = await db
				.update("user", "merge_test")
				.merge({ email: "merged@example.com" })
				.execute();

			expect(result[0]!.email).toBe("merged@example.com");
			// Other fields should be preserved
			expect(result[0]!.name.first).toBe("Original");
			expect(result[0]!.age).toBe(30);
		});
	});

	describe("Operators", () => {
		test("+= increments a number", async () => {
			const { db } = getTestDb();

			await db
				.create("user", "inc_test")
				.set({
					name: { first: "Inc", last: "User" },
					age: 30,
					email: "inc@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.update("user", "inc_test")
				.set({ age: { "+=": 5 } })
				.execute();

			expect(result[0]!.age).toBe(35);
		});

		test("-= decrements a number", async () => {
			const { db } = getTestDb();

			await db
				.create("user", "dec_test")
				.set({
					name: { first: "Dec", last: "User" },
					age: 30,
					email: "dec@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.update("user", "dec_test")
				.set({ age: { "-=": 10 } })
				.execute();

			expect(result[0]!.age).toBe(20);
		});
	});

	describe("RETURN clauses", () => {
		test("return('none') returns empty", async () => {
			const { db } = getTestDb();

			await db
				.create("user", "ret_none")
				.set({
					name: { first: "None", last: "User" },
					age: 30,
					email: "none@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.update("user", "ret_none")
				.set({ age: 31 })
				.return("none")
				.execute();

			expect(result).toBeDefined();
		});

		test("return('before') returns pre-update state", async () => {
			const { db } = getTestDb();

			await db
				.create("user", "ret_before")
				.set({
					name: { first: "Before", last: "User" },
					age: 30,
					email: "before@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.update("user", "ret_before")
				.set({ age: 31 })
				.return("before")
				.execute();

			expect(result[0]!.age).toBe(30);
		});

		test("return('after') returns post-update state", async () => {
			const { db } = getTestDb();

			await db
				.create("user", "ret_after")
				.set({
					name: { first: "After", last: "User" },
					age: 30,
					email: "after@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.update("user", "ret_after")
				.set({ age: 31 })
				.return("after")
				.execute();

			expect(result[0]!.age).toBe(31);
		});

		test("return('diff') returns JSON patches", async () => {
			const { db } = getTestDb();

			await db
				.create("user", "ret_diff")
				.set({
					name: { first: "Diff", last: "User" },
					age: 30,
					email: "diff@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.update("user", "ret_diff")
				.set({ age: 31 })
				.return("diff")
				.execute();

			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
		});
	});

	describe("Array RETURN projections", () => {
		test("create with array return callback", async () => {
			const { db } = getTestDb();
			const result = await db
				.create("user", "arr_create")
				.set({
					name: { first: "Array", last: "Create" },
					age: 42,
					email: "arr@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.return((record) => [record.name.first, record.age])
				.execute();

			expect(result).toBeDefined();
			expect(result.length).toBe(1);
			expect(Array.isArray(result[0])).toBe(true);
			expect(result[0]![0]).toBe("Array");
			expect(result[0]![1]).toBe(42);
		});

		test("update with array return callback", async () => {
			const { db } = getTestDb();

			await db
				.create("user", "arr_update")
				.set({
					name: { first: "Update", last: "User" },
					age: 30,
					email: "arr_update@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.update("user", "arr_update")
				.set({ age: 31 })
				.return((record) => [record.name.first, record.age])
				.execute();

			expect(result).toBeDefined();
			expect(result.length).toBe(1);
			expect(Array.isArray(result[0])).toBe(true);
			expect(result[0]![0]).toBe("Update");
			expect(result[0]![1]).toBe(31);
		});

		test("delete with array return callback", async () => {
			const { db } = getTestDb();

			await db
				.create("user", "arr_delete")
				.set({
					name: { first: "Delete", last: "User" },
					age: 50,
					email: "arr_delete@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.delete("user", "arr_delete")
				.return((record) => [record.name.first, record.age])
				.execute();

			expect(result).toBeDefined();
			expect(result.length).toBe(1);
			expect(Array.isArray(result[0])).toBe(true);
			expect(result[0]![0]).toBe("Delete");
			expect(result[0]![1]).toBe(50);
		});
	});

	describe("DELETE with RETURN", () => {
		test("return('before') on delete returns deleted record", async () => {
			const { db } = getTestDb();

			await db
				.create("user", "del_ret")
				.set({
					name: { first: "Delete", last: "User" },
					age: 30,
					email: "delete@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.delete("user", "del_ret")
				.return("before")
				.execute();

			expect(result[0]!.name.first).toBe("Delete");
		});
	});

	describe("RELATE with content", () => {
		test("creates edge with SET data", async () => {
			const { db } = getTestDb();

			// Create user and post first
			await db
				.create("user", "rel_user")
				.set({
					name: { first: "Rel", last: "User" },
					age: 30,
					email: "rel@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			await db
				.create("post", "rel_post")
				.set({
					title: "Relate Test",
					body: "Testing relate",
					author: new RecordId("user", "rel_user"),
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.relate(
					"authored",
					new RecordId("user", "rel_user"),
					new RecordId("post", "rel_post"),
				)
				.set({
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
		});
	});
});
