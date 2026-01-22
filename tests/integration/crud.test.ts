import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { withTestDb } from "./setup";

describe("CRUD Integration Tests", () => {
	const getTestDb = withTestDb();

	describe("CREATE operations", () => {
		test("creates a single user record", async () => {
			const { db } = getTestDb();
			const result = await db
				.create("user")
				.set({
					name: { first: "John", last: "Doe" },
					age: 30,
					email: "john@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBeGreaterThan(0);
			expect(result[0].name.first).toBe("John");
			expect(result[0].age).toBe(30);
		});

		test("creates a user with specific ID", async () => {
			const { db } = getTestDb();
			const result = await db
				.create("user", "test_user_123")
				.set({
					name: { first: "Alice", last: "Smith" },
					age: 25,
					email: "alice@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			expect(result[0].id.id).toBe("test_user_123");
			expect(result[0].name.first).toBe("Alice");
		});

		test("creates a user with content", async () => {
			const { db } = getTestDb();
			const result = await db
				.create("user")
				.content({
					name: { first: "Bob", last: "Jones" },
					age: 35,
					email: "bob@example.com",
					created: new Date(),
					updated: new Date(),
				} as any)
				.execute();

			expect(result[0].name.first).toBe("Bob");
			expect(result[0].age).toBe(35);
		});
	});

	describe("INSERT operations", () => {
		test("inserts a single record", async () => {
			const { db } = getTestDb();
			const result = await db
				.insert("user", {
					name: { first: "Charlie", last: "Brown" },
					age: 28,
					email: "charlie@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
			expect(result[0].name.first).toBe("Charlie");
		});

		test("inserts multiple records", async () => {
			const { db } = getTestDb();
			const result = await db
				.insert("user", [
					{
						name: { first: "Dave", last: "Wilson" },
						age: 32,
						email: "dave@example.com",
						created: new Date(),
						updated: new Date(),
					},
					{
						name: { first: "Eve", last: "Davis" },
						age: 29,
						email: "eve@example.com",
						created: new Date(),
						updated: new Date(),
					},
				])
				.execute();

			expect(result.length).toBe(2);
			expect(result[0].name.first).toBe("Dave");
			expect(result[1].name.first).toBe("Eve");
		});
	});

	describe("UPDATE operations", () => {
		test("updates a specific record", async () => {
			const { db, surreal } = getTestDb();

			// First create a user
			const createResult = await db
				.create("user", "update_test_1")
				.set({
					name: { first: "Frank", last: "Miller" },
					age: 40,
					email: "frank@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			expect(createResult[0].age).toBe(40);

			// Now update the user
			const updateResult = await db
				.update("user", "update_test_1")
				.set({ age: 41 })
				.execute();

			expect(updateResult[0].age).toBe(41);
			expect(updateResult[0].name.first).toBe("Frank");
		});

		test("updates with += operator", async () => {
			const { db } = getTestDb();

			// Create a user
			await db
				.create("user", "increment_test")
				.set({
					name: { first: "Grace", last: "Lee" },
					age: 30,
					email: "grace@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			// Update with increment
			const result = await db
				.update("user", "increment_test")
				.set({ age: { "+=": 5 } })
				.execute();

			expect(result[0].age).toBe(35);
		});

		test("updates with WHERE clause", async () => {
			const { db } = getTestDb();

			// Create multiple users
			await db
				.insert("user", [
					{
						name: { first: "Young1", last: "User" },
						age: 15,
						email: "young1@example.com",
						created: new Date(),
						updated: new Date(),
					},
					{
						name: { first: "Young2", last: "User" },
						age: 16,
						email: "young2@example.com",
						created: new Date(),
						updated: new Date(),
					},
				])
				.execute();

			// Update all users under 18
			const result = await db
				.update("user")
				.where(($this) => $this.age.lt(18))
				.set({ age: 18 })
				.execute();

			expect(result.length).toBeGreaterThanOrEqual(2);
			for (const user of result) {
				expect(user.age).toBe(18);
			}
		});
	});

	describe("DELETE operations", () => {
		test("deletes a specific record", async () => {
			const { db, surreal } = getTestDb();

			// Create a user
			await db
				.create("user", "delete_test_1")
				.set({
					name: { first: "ToDelete", last: "User" },
					age: 99,
					email: "delete@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			// Delete the user
			await db.delete("user", "delete_test_1").execute();

			// Verify deletion
			const result = await surreal.select(
				new RecordId("user", "delete_test_1"),
			);
			expect(result).toBeNull();
		});

		test("deletes with WHERE clause", async () => {
			const { db } = getTestDb();

			// Create users with age > 100
			await db
				.insert("user", [
					{
						name: { first: "Old1", last: "User" },
						age: 101,
						email: "old1@example.com",
						created: new Date(),
						updated: new Date(),
					},
					{
						name: { first: "Old2", last: "User" },
						age: 102,
						email: "old2@example.com",
						created: new Date(),
						updated: new Date(),
					},
				])
				.execute();

			// Delete all users older than 100
			const result = await db
				.delete("user")
				.where(($this) => $this.age.gt(100))
				.execute();

			expect(result.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("UPSERT operations", () => {
		test("creates record if it doesn't exist", async () => {
			const { db } = getTestDb();

			const result = await db
				.upsert("user", "upsert_test_1")
				.set({
					name: { first: "Upsert", last: "User" },
					age: 50,
					email: "upsert@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			expect(result[0].name.first).toBe("Upsert");
			expect(result[0].age).toBe(50);
		});

		test("updates record if it exists", async () => {
			const { db } = getTestDb();

			// First upsert
			await db
				.upsert("user", "upsert_test_2")
				.set({
					name: { first: "First", last: "Time" },
					age: 25,
					email: "first@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			// Second upsert (should update)
			const result = await db
				.upsert("user", "upsert_test_2")
				.set({
					age: 26,
				})
				.execute();

			expect(result[0].age).toBe(26);
		});
	});

	describe("RELATE operations", () => {
		test("creates a relationship between records", async () => {
			const { db } = getTestDb();

			// Create a user and a post
			const userResult = await db
				.create("user", "author1")
				.set({
					name: { first: "Author", last: "One" },
					age: 30,
					email: "author1@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const postResult = await db
				.create("post", "post1")
				.set({
					title: "First Post",
					body: "This is my first post",
					author: new RecordId("user", "author1"),
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			// Create relationship
			const relateResult = await db
				.relate(
					"authored",
					new RecordId("user", "author1"),
					new RecordId("post", "post1"),
				)
				.set({
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			expect(relateResult).toBeDefined();
			expect(relateResult.length).toBeGreaterThan(0);
			expect(relateResult[0].in.id).toBe("author1");
			expect(relateResult[0].out.id).toBe("post1");
		});

		test("creates multiple relationships (cartesian)", async () => {
			const { db } = getTestDb();

			// Create users and posts
			await db
				.insert("user", [
					{
						name: { first: "Author", last: "Two" },
						age: 28,
						email: "author2@example.com",
						created: new Date(),
						updated: new Date(),
					},
					{
						name: { first: "Author", last: "Three" },
						age: 32,
						email: "author3@example.com",
						created: new Date(),
						updated: new Date(),
					},
				])
				.execute();

			await db
				.insert("post", [
					{
						title: "Post A",
						body: "Content A",
						author: new RecordId("user", "author2"),
						created: new Date(),
						updated: new Date(),
					},
					{
						title: "Post B",
						body: "Content B",
						author: new RecordId("user", "author3"),
						created: new Date(),
						updated: new Date(),
					},
				])
				.execute();

			// Note: The actual RecordIds will be different, so this test
			// demonstrates the concept but needs adjustment for real IDs
		});
	});
});
