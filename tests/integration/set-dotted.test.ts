import { describe, expect, test } from "bun:test";
import { orm, TypeParseError, t, table } from "../../src";
import { OrmError } from "../../src/error";
import { withTestDb } from "./setup";

const person = table("person", {
	name: t.object({ first: t.string(), last: t.string() }),
	age: t.number(),
});

describe("dotted keys in set() against a live server", () => {
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			await surreal.query(`
				CREATE person:a SET name = { first: "Ann", last: "Lee" }, age = 30;
			`);
		},
	});

	test("update().set() with a dotted key changes only that nested field", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, person);

		const row = await db
			.update("person", "a")
			.set({ "name.first": "Ada" })
			.only()
			.execute();

		expect(row.name).toEqual({ first: "Ada", last: "Lee" });
		expect(row.age).toBe(30);
	});

	test("update().set() mixes a dotted key with a plain field", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, person);

		const row = await db
			.update("person", "a")
			.set({ "name.last": "Lovelace", age: 36 })
			.only()
			.execute();

		expect(row.name).toEqual({ first: "Ann", last: "Lovelace" });
		expect(row.age).toBe(36);
	});

	test("create().set() with a dotted key and no parent object throws before anything is sent", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, person);

		let sent = 0;
		const query = surreal.query.bind(surreal);
		surreal.query = ((...args: Parameters<typeof query>) => {
			sent++;
			return query(...args);
		}) as typeof surreal.query;

		expect(() =>
			db.create("person", "b").set({
				// @ts-expect-error name is not set in this call
				"name.first": "Ada",
				age: 1,
			}),
		).toThrow(OrmError);
		expect(sent).toBe(0);

		const [stored] = await surreal
			.query("SELECT * FROM person:b")
			.collect<[unknown[]]>();
		expect(stored).toEqual([]);
	});

	test("create().set() with the parent object set in full in the same call writes the dotted key", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, person);

		const row = await db
			.create("person", "b")
			.set({
				name: { first: "Ada", last: "Lovelace" },
				"name.first": "Byron",
				age: 1,
			})
			.only()
			.execute();

		expect(row.name).toEqual({ first: "Byron", last: "Lovelace" });
	});

	// Limit: an UPDATE cannot know whether the object exists on the stored record,
	// so a dotted key into a missing object is allowed and stores a partial object.
	// Reading the record back with the full schema then fails until it is completed.
	test("update().set() into a missing object stores a partial object that the full schema cannot read back", async () => {
		const { surreal } = getTestDb();
		await surreal.query(`CREATE person:c SET age = 2`);
		const db = orm(surreal, person);

		await db
			.update("person", "c")
			.set({ "name.first": "Cy" })
			.return("none")
			.execute();

		const [stored] = await surreal
			.query("SELECT * FROM person:c")
			.collect<[{ name: unknown }[]]>();
		expect(stored?.[0]?.name).toEqual({ first: "Cy" });
		await expect(db.select("person").execute()).rejects.toThrow(TypeParseError);
	});
});

describe("dotted keys into an optional nested object", () => {
	const place = table("place", {
		address: t.option(t.object({ city: t.string(), zip: t.string() })),
	});

	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			await surreal.query(`
				CREATE place:a SET address = { city: "London", zip: "N1" };
			`);
		},
	});

	test("update().set() with a dotted key into an option<object> changes only that field", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, place);

		const row = await db
			.update("place", "a")
			.set({ "address.city": "Paris" })
			.only()
			.execute();

		expect(row.address).toEqual({ city: "Paris", zip: "N1" });
	});
});
