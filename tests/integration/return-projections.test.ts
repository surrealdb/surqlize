import { describe, expect, test } from "bun:test";
import { seedTestData } from "../helpers/db";
import { withTestDb } from "./setup";

describe("Return projection integration tests", () => {
	// ─── SELECT ────────────────────────────────────────────────────────────

	describe("SELECT projections", () => {
		const getTestDb = withTestDb({
			setup: async ({ surreal }) => {
				await seedTestData(surreal);
			},
		});

		test("RETURN VALUE <field> — single field returns bare values", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.return((r) => r.email)
				.execute();

			expect(result.length).toBe(3);
			for (const email of result) {
				expect(typeof email).toBe("string");
				expect(email).toContain("@example.com");
			}
		});

		test("RETURN VALUE <nested> — nested field access", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.return((r) => r.name.first)
				.execute();

			expect(result.length).toBe(3);
			const names = result.sort();
			expect(names).toContain("Alice");
			expect(names).toContain("Bob");
			expect(names).toContain("Charlie");
		});

		test("RETURN { ... } — flat object projection", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.return((r) => ({
					firstName: r.name.first,
					email: r.email,
				}))
				.execute();

			expect(result.length).toBe(3);
			for (const row of result) {
				expect(row).toHaveProperty("firstName");
				expect(row).toHaveProperty("email");
				expect(typeof row.firstName).toBe("string");
				expect(typeof row.email).toBe("string");
			}
		});

		test("RETURN { ... } — nested object projection", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.return((r) => ({
					info: {
						name: r.name.first,
						contact: r.email,
					},
				}))
				.execute();

			expect(result.length).toBe(3);
			for (const row of result) {
				expect(row.info).toBeDefined();
				expect(typeof row.info.name).toBe("string");
				expect(typeof row.info.contact).toBe("string");
			}
		});

		test("RETURN [ ... ] — flat array projection", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.return((r) => [r.name.first, r.age])
				.execute();

			expect(result.length).toBe(3);
			for (const row of result) {
				expect(Array.isArray(row)).toBe(true);
				expect(row.length).toBe(2);
				expect(typeof row[0]).toBe("string");
				expect(typeof row[1]).toBe("number");
			}
		});

		test("RETURN [ ... ] — three-element array", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.return((r) => [r.name.first, r.name.last, r.email])
				.execute();

			expect(result.length).toBe(3);
			for (const row of result) {
				expect(Array.isArray(row)).toBe(true);
				expect(row.length).toBe(3);
				for (const item of row) {
					expect(typeof item).toBe("string");
				}
			}
		});

		test("RETURN [ ... ] — array with nested object", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.return((r) => [r.email, { fullName: r.name }])
				.execute();

			expect(result.length).toBe(3);
			for (const row of result) {
				expect(Array.isArray(row)).toBe(true);
				expect(row.length).toBe(2);
				expect(typeof row[0]).toBe("string");
				expect(row[1]).toHaveProperty("fullName");
				expect(row[1].fullName).toHaveProperty("first");
				expect(row[1].fullName).toHaveProperty("last");
			}
		});

		test("RETURN { ... } — object with array inside", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.return((r) => ({
					names: [r.name.first, r.name.last],
					age: r.age,
				}))
				.execute();

			expect(result.length).toBe(3);
			for (const row of result) {
				expect(Array.isArray(row.names)).toBe(true);
				expect(row.names.length).toBe(2);
				expect(typeof row.names[0]).toBe("string");
				expect(typeof row.names[1]).toBe("string");
				expect(typeof row.age).toBe("number");
			}
		});

		test("RETURN [ ... ] — nested arrays", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.return((r) => [r.email, [r.name.first, r.name.last]])
				.execute();

			expect(result.length).toBe(3);
			for (const row of result) {
				expect(Array.isArray(row)).toBe(true);
				expect(row.length).toBe(2);
				expect(typeof row[0]).toBe("string");
				expect(Array.isArray(row[1])).toBe(true);
				expect(row[1].length).toBe(2);
			}
		});

		test("RETURN VALUE <field> — single element array", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.return((r) => [r.age])
				.execute();

			expect(result.length).toBe(3);
			for (const row of result) {
				expect(Array.isArray(row)).toBe(true);
				expect(row.length).toBe(1);
				expect(typeof row[0]).toBe("number");
			}
		});

		test("RETURN { ... } — deeply nested object with array", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.return((r) => ({
					profile: {
						names: [r.name.first, r.name.last],
						meta: { email: r.email },
					},
				}))
				.execute();

			expect(result.length).toBe(3);
			for (const row of result) {
				expect(row.profile).toBeDefined();
				expect(Array.isArray(row.profile.names)).toBe(true);
				expect(row.profile.names.length).toBe(2);
				expect(row.profile.meta).toBeDefined();
				expect(typeof row.profile.meta.email).toBe("string");
			}
		});

		test("WHERE + RETURN VALUE — combined", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.where((r) => r.age.gte(30))
				.return((r) => [r.name.first, r.age])
				.execute();

			expect(result.length).toBe(2); // Alice (30) and Charlie (35)
			for (const row of result) {
				expect(Array.isArray(row)).toBe(true);
				expect(row[1]).toBeGreaterThanOrEqual(30);
			}
		});

		test("LIMIT + RETURN VALUE — combined", async () => {
			const { db } = getTestDb();
			const result = await db
				.select("user")
				.limit(2)
				.return((r) => [r.name.first, r.age])
				.execute();

			expect(result.length).toBe(2);
			for (const row of result) {
				expect(Array.isArray(row)).toBe(true);
				expect(row.length).toBe(2);
			}
		});
	});

	// ─── CREATE ────────────────────────────────────────────────────────────

	describe("CREATE projections", () => {
		const getTestDb = withTestDb({ perTest: true });

		test("RETURN VALUE <field> — single field", async () => {
			const { db } = getTestDb();
			const result = await db
				.create("user", "proj_val")
				.set({
					name: { first: "Test", last: "User" },
					age: 25,
					email: "test@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.return((r) => r.email)
				.execute();

			expect(result.length).toBe(1);
			expect(result[0]).toBe("test@example.com");
		});

		test("RETURN VALUE { ... } — object", async () => {
			const { db } = getTestDb();
			const result = await db
				.create("user", "proj_obj")
				.set({
					name: { first: "Test", last: "User" },
					age: 25,
					email: "test@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.return((r) => ({ firstName: r.name.first, age: r.age }))
				.execute();

			expect(result.length).toBe(1);
			expect(result[0]!.firstName).toBe("Test");
			expect(result[0]!.age).toBe(25);
		});

		test("RETURN VALUE [ ... ] — array", async () => {
			const { db } = getTestDb();
			const result = await db
				.create("user", "proj_arr")
				.set({
					name: { first: "Test", last: "User" },
					age: 25,
					email: "test@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.return((r) => [r.name.first, r.age, r.email])
				.execute();

			expect(result.length).toBe(1);
			expect(result[0]![0]).toBe("Test");
			expect(result[0]![1]).toBe(25);
			expect(result[0]![2]).toBe("test@example.com");
		});

		test("RETURN VALUE { ... } — object with nested array", async () => {
			const { db } = getTestDb();
			const result = await db
				.create("user", "proj_nested")
				.set({
					name: { first: "Test", last: "User" },
					age: 25,
					email: "test@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.return((r) => ({
					names: [r.name.first, r.name.last],
					age: r.age,
				}))
				.execute();

			expect(result.length).toBe(1);
			expect(result[0]!.names[0]).toBe("Test");
			expect(result[0]!.names[1]).toBe("User");
			expect(result[0]!.age).toBe(25);
		});
	});

	// ─── UPDATE ────────────────────────────────────────────────────────────

	describe("UPDATE projections", () => {
		const getTestDb = withTestDb({ perTest: true });

		test("RETURN VALUE <field> — single field after update", async () => {
			const { db } = getTestDb();

			await db
				.create("user", "upd_val")
				.set({
					name: { first: "Before", last: "User" },
					age: 20,
					email: "upd@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.update("user", "upd_val")
				.set({ age: 21 })
				.return((r) => r.age)
				.execute();

			expect(result.length).toBe(1);
			expect(result[0]).toBe(21);
		});

		test("RETURN VALUE { ... } — object after update", async () => {
			const { db } = getTestDb();

			await db
				.create("user", "upd_obj")
				.set({
					name: { first: "Before", last: "User" },
					age: 20,
					email: "upd@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.update("user", "upd_obj")
				.set({ age: 21 })
				.return((r) => ({ name: r.name.first, age: r.age }))
				.execute();

			expect(result.length).toBe(1);
			expect(result[0]!.name).toBe("Before");
			expect(result[0]!.age).toBe(21);
		});

		test("RETURN VALUE [ ... ] — array after update", async () => {
			const { db } = getTestDb();

			await db
				.create("user", "upd_arr")
				.set({
					name: { first: "Before", last: "User" },
					age: 20,
					email: "upd@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.update("user", "upd_arr")
				.set({ age: 21 })
				.return((r) => [r.name.first, r.age])
				.execute();

			expect(result.length).toBe(1);
			expect(result[0]![0]).toBe("Before");
			expect(result[0]![1]).toBe(21);
		});

		test("RETURN VALUE [ ... ] — array with nested object after update", async () => {
			const { db } = getTestDb();

			await db
				.create("user", "upd_mix")
				.set({
					name: { first: "Before", last: "User" },
					age: 20,
					email: "upd@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const result = await db
				.update("user", "upd_mix")
				.set({ age: 21 })
				.return((r) => [r.email, { fullName: r.name, age: r.age }])
				.execute();

			expect(result.length).toBe(1);
			expect(result[0]![0]).toBe("upd@example.com");
			expect(result[0]![1].fullName.first).toBe("Before");
			expect(result[0]![1].age).toBe(21);
		});
	});

	// ─── UPSERT ────────────────────────────────────────────────────────────

	describe("UPSERT projections", () => {
		const getTestDb = withTestDb({ perTest: true });

		test("RETURN VALUE <field> — creates and returns single field", async () => {
			const { db } = getTestDb();
			const result = await db
				.upsert("user", "ups_val")
				.set({
					name: { first: "Upsert", last: "User" },
					age: 40,
					email: "ups@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.return((r) => r.email)
				.execute();

			expect(result.length).toBe(1);
			expect(result[0]).toBe("ups@example.com");
		});

		test("RETURN VALUE [ ... ] — creates and returns array", async () => {
			const { db } = getTestDb();
			const result = await db
				.upsert("user", "ups_arr")
				.set({
					name: { first: "Upsert", last: "User" },
					age: 40,
					email: "ups@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.return((r) => [r.name.first, r.age])
				.execute();

			expect(result.length).toBe(1);
			expect(result[0]![0]).toBe("Upsert");
			expect(result[0]![1]).toBe(40);
		});
	});
});
