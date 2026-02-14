import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { OrmError } from "../../src";
import { withTestDb } from "./setup";

describe("Error handling integration tests", () => {
	const getTestDb = withTestDb({ perTest: true });

	describe("Invalid table in relate()", () => {
		test("throws OrmError when using a non-edge table for relate", () => {
			const { db } = getTestDb();

			expect(() => {
				db.relate(
					"user" as never,
					new RecordId("user", "alice"),
					new RecordId("post", "post1"),
				);
			}).toThrow('"user" is not an edge table');

			try {
				db.relate(
					"user" as never,
					new RecordId("user", "alice"),
					new RecordId("post", "post1"),
				);
			} catch (err) {
				expect(err).toBeInstanceOf(OrmError);
			}
		});
	});

	describe("Modification mode conflicts", () => {
		test("set() then content() throws OrmError", () => {
			const { db } = getTestDb();

			expect(() => {
				db.create("user")
					.set({
						name: { first: "Test", last: "User" },
						age: 30,
						email: "test@example.com",
						created: new Date(),
						updated: new Date(),
					})
					.content({
						name: { first: "Test", last: "User" },
						age: 31,
						email: "test@example.com",
						created: new Date(),
						updated: new Date(),
					});
			}).toThrow("Cannot use content() when set() has already been used");

			try {
				db.create("user")
					.set({
						name: { first: "Test", last: "User" },
						age: 30,
						email: "test@example.com",
						created: new Date(),
						updated: new Date(),
					})
					.content({
						name: { first: "Test", last: "User" },
						age: 31,
						email: "test@example.com",
						created: new Date(),
						updated: new Date(),
					});
			} catch (err) {
				expect(err).toBeInstanceOf(OrmError);
			}
		});

		test("content() then merge() throws OrmError", () => {
			const { db } = getTestDb();

			expect(() => {
				db.update("user", "test").content({ age: 30 }).merge({ age: 31 });
			}).toThrow("Cannot use merge() when content() has already been used");

			try {
				db.update("user", "test").content({ age: 30 }).merge({ age: 31 });
			} catch (err) {
				expect(err).toBeInstanceOf(OrmError);
			}
		});

		test("merge() then patch() throws OrmError", () => {
			const { db } = getTestDb();

			expect(() => {
				db.update("user", "test")
					.merge({ age: 30 })
					.patch([{ op: "replace", path: "/age", value: 31 }]);
			}).toThrow("Cannot use patch() when merge() has already been used");

			try {
				db.update("user", "test")
					.merge({ age: 30 })
					.patch([{ op: "replace", path: "/age", value: 31 }]);
			} catch (err) {
				expect(err).toBeInstanceOf(OrmError);
			}
		});
	});

	describe("Non-existent record", () => {
		test("select by ID returns empty array", async () => {
			const { db } = getTestDb();

			// Create a record to ensure the table exists.
			await db
				.create("user", "exists")
				.set({
					name: { first: "Exists", last: "User" },
					age: 30,
					email: "exists@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.select(new RecordId("user", "does_not_exist"))
				.execute();

			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBe(0);
		});
	});

	describe("UPSERT behavior", () => {
		test("creates record if it doesn't exist", async () => {
			const { db } = getTestDb();

			const result = await db
				.upsert("user", "upsert_new")
				.set({
					name: { first: "Upsert", last: "New" },
					age: 30,
					email: "upsert@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			expect(result[0]!.name.first).toBe("Upsert");
		});

		test("updates record if it already exists", async () => {
			const { db } = getTestDb();

			// Create first
			await db
				.create("user", "upsert_existing")
				.set({
					name: { first: "Original", last: "User" },
					age: 25,
					email: "original@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			// Upsert should update
			const result = await db
				.upsert("user", "upsert_existing")
				.set({
					name: { first: "Updated", last: "User" },
					age: 30,
					email: "updated@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			expect(result[0]!.name.first).toBe("Updated");
			expect(result[0]!.age).toBe(30);
		});
	});
});
