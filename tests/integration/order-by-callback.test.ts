import { describe, expect, test } from "bun:test";
import { seedTestData } from "../helpers/db";
import { withTestDb } from "./setup";

/**
 * ORDER BY with a field-path callback must render a bare idiom, which SurrealDB
 * accepts. `$this.first` is rejected by the server for any field.
 */
describe("orderBy with a field-path callback", () => {
	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await seedTestData(surreal);
		},
	});

	// Seeded users: Alice Smith (30), Bob Jones (25), Charlie Brown (35).
	const lastNames = (rows: { name: { last: string } }[]) =>
		rows.map((r) => r.name.last);

	test("a top-level field callback sorts like the string form", async () => {
		const { db } = getTestDb();
		const byCallback = await db
			.select("user")
			.orderBy((u) => u.age, "DESC")
			.execute();
		const byString = await db.select("user").orderBy("age", "DESC").execute();

		expect(byCallback.map((r) => r.age)).toEqual([35, 30, 25]);
		expect(byCallback.map((r) => r.age)).toEqual(byString.map((r) => r.age));
	});

	test("a nested field callback sorts by the nested field", async () => {
		const { db } = getTestDb();
		const rows = await db
			.select("user")
			.orderBy((u) => u.name.last, "ASC")
			.execute();

		expect(lastNames(rows)).toEqual(["Brown", "Jones", "Smith"]);
	});

	test("the README form (user => user.name.last) sorts on the server", async () => {
		const { db } = getTestDb();
		const rows = await db
			.select("user")
			.orderBy((user) => user.name.last, "DESC")
			.execute();

		expect(lastNames(rows)).toEqual(["Smith", "Jones", "Brown"]);
	});

	test("the object form still sorts on the nested field", async () => {
		const { db } = getTestDb();
		const rows = await db
			.select("user")
			.orderBy({ name: { last: "asc" } })
			.execute();

		expect(lastNames(rows)).toEqual(["Brown", "Jones", "Smith"]);
	});

	test("a field callback combines with a second sort key", async () => {
		const { db } = getTestDb();
		const rows = await db
			.select("user")
			.orderBy((u) => u.name.first, "ASC")
			.orderBy((u) => u.age, "DESC")
			.execute();

		expect(rows.map((r) => r.name.first)).toEqual(["Alice", "Bob", "Charlie"]);
	});
});
