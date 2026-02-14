import { describe, expect, test } from "bun:test";
import { seedTestData } from "../helpers/db";
import { withTestDb } from "./setup";

describe("SELECT clause integration tests", () => {
	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await seedTestData(surreal);
		},
	});

	describe("ORDER BY", () => {
		test("orders by age ASC", async () => {
			const { db } = getTestDb();
			const result = await db.select("user").orderBy("age", "ASC").execute();

			expect(result.length).toBe(3);
			for (let i = 1; i < result.length; i++) {
				expect(result[i].age).toBeGreaterThanOrEqual(result[i - 1].age);
			}
		});

		test("orders by age DESC", async () => {
			const { db } = getTestDb();
			const result = await db.select("user").orderBy("age", "DESC").execute();

			expect(result.length).toBe(3);
			for (let i = 1; i < result.length; i++) {
				expect(result[i].age).toBeLessThanOrEqual(result[i - 1].age);
			}
		});

		test("orders by nested field via callback", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.orderBy((user) => user.name.first, "ASC")
				.execute();

			expect(result.length).toBe(3);
			// Alice, Bob, Charlie in alphabetical order
			expect(result[0].name.first).toBe("Alice");
			expect(result[1].name.first).toBe("Bob");
			expect(result[2].name.first).toBe("Charlie");
		});
	});

	describe("LIMIT and START", () => {
		test("LIMIT restricts result count", async () => {
			const { db } = getTestDb();
			const result = await db.select("user").limit(1).execute();

			expect(result.length).toBe(1);
		});

		test("START offsets results", async () => {
			const { db } = getTestDb();
			const all = await db.select("user").orderBy("age", "ASC").execute();
			const offset = await db
				.select("user")
				.orderBy("age", "ASC")
				.start(1)
				.execute();

			expect(offset.length).toBe(all.length - 1);
			expect(offset[0].age).toBe(all[1].age);
		});

		test("LIMIT + START together for pagination", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.orderBy("age", "ASC")
				.start(1)
				.limit(1)
				.execute();

			expect(result.length).toBe(1);
		});
	});

	describe("WHERE + ORDER BY + LIMIT combined", () => {
		test("filters, sorts, and limits in one query", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.where(($this) => $this.age.gte(25))
				.orderBy("age", "DESC")
				.limit(2)
				.execute();

			expect(result.length).toBeLessThanOrEqual(2);
			for (const user of result) {
				expect(user.age).toBeGreaterThanOrEqual(25);
			}
			if (result.length === 2) {
				expect(result[0].age).toBeGreaterThanOrEqual(result[1].age);
			}
		});
	});

	describe("TIMEOUT", () => {
		test("query with timeout executes successfully", async () => {
			const { db } = getTestDb();
			const result = await db.select("user").timeout("5s").execute();

			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
		});
	});

	describe("FETCH", () => {
		test("fetches record references inline", async () => {
			const { db } = getTestDb();
			const result = await db.select("post").fetch("author").execute();

			expect(result).toBeDefined();
			expect(result.length).toBeGreaterThan(0);
			// When fetched, author should be resolved to the full record
			for (const post of result) {
				expect(post).toHaveProperty("title");
				expect(post).toHaveProperty("author");
			}
		});
	});
});
