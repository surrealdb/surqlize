import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { TypeParseError } from "../../src";
import { seedTestData } from "../helpers/db";
import { withTestDb } from "./setup";

describe(".only() integration tests", () => {
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			await seedTestData(surreal);
		},
	});

	describe("SELECT", () => {
		test("returns a single object for a record id", async () => {
			const { db } = getTestDb();

			const user = await db.select("user", "alice").only().execute();

			expect(Array.isArray(user)).toBe(false);
			expect(user.id.id).toBe("alice");
			expect(user.name.first).toBe("Alice");
		});

		test("still returns an array when only() is not used", async () => {
			const { db } = getTestDb();

			const users = await db.select("user", "alice").execute();

			expect(Array.isArray(users)).toBe(true);
			expect(users).toHaveLength(1);
			expect(users[0]!.name.first).toBe("Alice");
		});

		test("returns a single object for a filtered query limited to one row", async () => {
			const { db } = getTestDb();

			const user = await db
				.select("user")
				.where((u) => u.age.gt(30))
				.limit(1)
				.only()
				.execute();

			expect(Array.isArray(user)).toBe(false);
			expect(user.id.id).toBe("charlie");
		});

		test("applies a projection in either chain order", async () => {
			const { db } = getTestDb();

			const onlyFirst = await db
				.select("user", "alice")
				.only()
				.return((u) => ({ first: u.name.first, age: u.age }))
				.execute();
			const returnFirst = await db
				.select("user", "alice")
				.return((u) => ({ first: u.name.first, age: u.age }))
				.only()
				.execute();

			expect(onlyFirst).toEqual({ first: "Alice", age: 30 });
			expect(returnFirst).toEqual(onlyFirst);
		});

		test("rejects when the query matches more than one row", async () => {
			const { db } = getTestDb();

			// SurrealDB refuses ONLY on a result set that is not a single record.
			// Checking the error did not come from schema parsing proves the
			// ONLY keyword was actually sent: without it the server would return
			// an array and parsing it as one record would throw instead.
			const error = await db
				.select("user")
				.only()
				.execute()
				.then(
					() => undefined,
					(e: unknown) => e,
				);

			expect(error).toBeInstanceOf(Error);
			expect(error).not.toBeInstanceOf(TypeParseError);
		});

		test("rejects rather than resolving to a mistyped value when the record does not exist", async () => {
			const { db } = getTestDb();

			// ONLY on a missing record yields NONE, which does not match the
			// record's schema. This pins down that it fails loudly instead of
			// returning a value that contradicts the declared type.
			await expect(
				db.select("user", "nobody").only().execute(),
			).rejects.toThrow();
		});
	});

	describe("nested selects", () => {
		test("a nested select only() adds no extra array layer", async () => {
			const { db } = getTestDb();

			const authors = await db
				.select("post")
				.return((post) => post.author.select().only())
				.execute();

			expect(authors).toHaveLength(2);
			expect(authors.every((author) => !Array.isArray(author))).toBe(true);
			expect(authors.map((author) => author.name.first).sort()).toEqual([
				"Alice",
				"Bob",
			]);
		});

		test("a nested select without only() still returns an array per row", async () => {
			const { db } = getTestDb();

			const authors = await db
				.select("post")
				.return((post) => post.author.select())
				.execute();

			expect(authors).toHaveLength(2);
			expect(authors.every((author) => Array.isArray(author))).toBe(true);
			expect(authors.map((author) => author[0]!.name.first).sort()).toEqual([
				"Alice",
				"Bob",
			]);
		});
	});

	describe("mutations", () => {
		const newUser = (first: string) => ({
			name: { first, last: "Tester" },
			age: 40,
			email: `${first.toLowerCase()}@example.com`,
			created: new Date(),
			updated: new Date(),
		});

		test("create().only() returns the created record", async () => {
			const { db, surreal } = getTestDb();

			const user = await db
				.create("user", "dave")
				.set(newUser("Dave"))
				.only()
				.execute();

			expect(Array.isArray(user)).toBe(false);
			expect(user.id.id).toBe("dave");
			expect(user.name.first).toBe("Dave");

			const stored = await surreal.select(new RecordId("user", "dave"));
			expect(stored).toBeTruthy();
		});

		test("update().only() returns the updated record", async () => {
			const { db, surreal } = getTestDb();

			const user = await db
				.update("user", "alice")
				.set({ age: 31 })
				.only()
				.execute();

			expect(Array.isArray(user)).toBe(false);
			expect(user.id.id).toBe("alice");
			expect(user.age).toBe(31);

			const stored = await surreal.select<{ age: number }>(
				new RecordId("user", "alice"),
			);
			expect(stored?.age).toBe(31);
		});

		test("upsert().only() creates, then updates, a single record", async () => {
			const { db } = getTestDb();

			const created = await db
				.upsert("user", "erin")
				.set(newUser("Erin"))
				.only()
				.execute();
			const updated = await db
				.upsert("user", "erin")
				.set({ age: 41 })
				.only()
				.execute();

			expect(Array.isArray(created)).toBe(false);
			expect(created.age).toBe(40);
			expect(Array.isArray(updated)).toBe(false);
			expect(updated.id.id).toBe("erin");
			expect(updated.age).toBe(41);
		});

		test("delete().only() returns the deleted record and removes it", async () => {
			const { db, surreal } = getTestDb();

			const deleted = await db
				.delete("user", "bob")
				.only()
				.return("before")
				.execute();

			expect(Array.isArray(deleted)).toBe(false);
			expect(deleted.id.id).toBe("bob");
			expect(deleted.name.first).toBe("Bob");

			const stored = await surreal.select(new RecordId("user", "bob"));
			expect(stored).toBeFalsy();
		});

		test("relate().only() returns the created edge", async () => {
			const { db } = getTestDb();

			const edge = await db
				.relate(
					"authored",
					new RecordId("user", "bob"),
					new RecordId("post", "post1"),
				)
				.set({ created: new Date(), updated: new Date() })
				.only()
				.execute();

			expect(Array.isArray(edge)).toBe(false);
			expect(String(edge.in)).toBe("user:bob");
			expect(String(edge.out)).toBe("post:post1");
		});
	});
});
