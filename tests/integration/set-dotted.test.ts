import { describe, expect, test } from "bun:test";
import { orm, t, table } from "../../src";
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

	// Known limitation: a dotted key into an object the record does not have yet
	// stores a partial object (`name = { first: "Ada" }`), and reading the record
	// back with the full schema then fails until `last` is set. The write itself
	// succeeds, so this asserts what is stored, not the read-back.
	test("create().set() with only a dotted key into a missing object stores the partial object", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, person);

		await db
			.create("person", "b")
			.set({ "name.first": "Ada", age: 1 })
			.return("none")
			.execute();

		const [stored] = await surreal
			.query("SELECT * FROM person:b")
			.collect<[{ name: { first: string }; age: number }[]]>();
		expect(stored?.[0]).toMatchObject({ name: { first: "Ada" }, age: 1 });
		expect(stored?.[0]?.name).toEqual({ first: "Ada" });
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
