import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { seedTestData } from "../helpers/db";
import { withTestDb } from "./setup";

describe("Complex Queries Integration Tests", () => {
	const getTestDb = withTestDb(async ({ surreal }) => {
		await seedTestData(surreal);
	});

	describe("SELECT with projections", () => {
		test("selects with custom return projection", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.return((user) => ({
					firstName: user.name.first,
					email: user.email,
				}))
				.execute();

			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
			expect(result[0]).toHaveProperty("firstName");
			expect(result[0]).toHaveProperty("email");
			expect(result[0]).not.toHaveProperty("name");
		});

		test("selects with string concatenation", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.return((user) => ({
					fullName: user.name.first.join(" ", user.name.last),
				}))
				.execute();

			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
			expect(result[0].fullName).toContain(" ");
		});
	});

	describe("SELECT with WHERE filters", () => {
		test("filters by exact equality", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.where(($this) => $this.name.first.eq("Alice"))
				.execute();

			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
			for (const user of result) {
				expect(user.name.first).toBe("Alice");
			}
		});

		test("filters by numeric comparison", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.where(($this) => $this.age.gte(30))
				.execute();

			expect(result).toBeDefined();
			for (const user of result) {
				expect(user.age).toBeGreaterThanOrEqual(30);
			}
		});

		test("filters with AND condition", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.where(($this) => $this.age.gte(25).and($this.age.lte(35)))
				.execute();

			expect(result).toBeDefined();
			for (const user of result) {
				expect(user.age).toBeGreaterThanOrEqual(25);
				expect(user.age).toBeLessThanOrEqual(35);
			}
		});

		test("filters with OR condition", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.where(($this) => $this.age.lt(26).or($this.age.gt(34)))
				.execute();

			expect(result).toBeDefined();
			for (const user of result) {
				expect(user.age < 26 || user.age > 34).toBe(true);
			}
		});
	});

	describe("SELECT with pagination", () => {
		test("limits results", async () => {
			const { db } = getTestDb();
			const result = await db.select("user").limit(2).execute();

			expect(result).toBeDefined();
			expect(result.length).toBeLessThanOrEqual(2);
		});

		test("starts from offset", async () => {
			const { db } = getTestDb();
			const allUsers = await db.select("user").execute();
			const offsetUsers = await db.select("user").start(1).execute();

			expect(offsetUsers.length).toBe(allUsers.length - 1);
		});

		test("combines start and limit", async () => {
			const { db } = getTestDb();
			const result = await db.select("user").start(1).limit(1).execute();

			expect(result).toBeDefined();
			expect(result.length).toBeLessThanOrEqual(1);
		});
	});

	describe("Nested SELECT queries", () => {
		test("selects with nested record lookup", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("post")
				.return((post) => ({
					title: post.title,
					author: post.author.select().return((author) => ({
						name: author.name,
						email: author.email,
					})),
				}))
				.execute();

			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
			expect(result[0]).toHaveProperty("title");
			expect(result[0]).toHaveProperty("author");

			// Check nested author data
			const firstPost = result[0];
			if (firstPost.author) {
				expect(firstPost.author).toHaveProperty("name");
				expect(firstPost.author).toHaveProperty("email");
			}
		});
	});

	describe("SELECT one record", () => {
		test("selects a single record by ID", async () => {
			const { db } = getTestDb();
			const result = await db.select(new RecordId("user", "alice")).execute();

			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBeGreaterThan(0);
			if (result.length > 0) {
				expect(result[0].id.id).toBe("alice");
				expect(result[0]).toHaveProperty("name");
			}
		});

		test("returns empty array for non-existent record", async () => {
			const { db } = getTestDb();
			const result = await db
				.select(new RecordId("user", "nonexistent"))
				.execute();

			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBe(0);
		});
	});

	describe("String functions in queries", () => {
		test("uses startsWith in WHERE clause", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.where(($this) => $this.email.startsWith("alice"))
				.execute();

			expect(result).toBeDefined();
			for (const user of result) {
				expect(user.email.startsWith("alice")).toBe(true);
			}
		});

		test("uses endsWith in WHERE clause", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.where(($this) => $this.email.endsWith("example.com"))
				.execute();

			expect(result).toBeDefined();
			for (const user of result) {
				expect(user.email.endsWith("example.com")).toBe(true);
			}
		});
	});

	describe("Complex UPDATE scenarios", () => {
		test("updates with projection return", async () => {
			const { db } = getTestDb();

			// Create a test user
			await db
				.create("user", "update_projection_test")
				.set({
					name: { first: "Test", last: "User" },
					age: 25,
					email: "test@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.update("user", "update_projection_test")
				.set({ age: 26 })
				.return((user) => user.name)
				.execute();

			expect(result).toBeDefined();
			expect(result[0]).toHaveProperty("first");
			expect(result[0]).toHaveProperty("last");
		});
	});

	describe("Graph relationships", () => {
		test("queries through edges", async () => {
			const { db, surreal } = getTestDb();

			// Query posts through authored edges
			const result = await surreal.query(
				"SELECT * FROM user WHERE id = user:alice FETCH ->authored->post",
			);

			expect(result).toBeDefined();
		});
	});

	describe("Batch operations", () => {
		test("performs multiple operations in sequence", async () => {
			const { db } = getTestDb();

			// Create, update, and select in sequence
			const createResult = await db
				.create("user", "batch_test")
				.set({
					name: { first: "Batch", last: "User" },
					age: 30,
					email: "batch@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			expect(createResult[0].age).toBe(30);

			const updateResult = await db
				.update("user", "batch_test")
				.set({ age: 31 })
				.execute();

			expect(updateResult[0].age).toBe(31);

			const selectResult = await db
				.select(new RecordId("user", "batch_test"))
				.execute();

			expect(Array.isArray(selectResult)).toBe(true);
			expect(selectResult[0]?.age).toBe(31);
		});
	});
});
