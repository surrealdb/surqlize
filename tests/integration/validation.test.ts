import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { orm, t, table, ValidationError } from "../../src";
import { withTestDb } from "./setup";

class Person {
	name!: string;
	get shout() {
		return this.name.toUpperCase();
	}
}

const person = table(
	"person",
	{
		name: t.string(),
		age: t.number(),
		nick: t.option(t.string()),
		role: t.string().default("member"),
		address: t.object({ city: t.string() }),
		boss: t.option(t.record("person")),
	},
	Person,
);

describe("runtime validation integration tests", () => {
	const getTestDb = withTestDb();
	const make = () => orm(getTestDb().surreal, person).validated();

	const ok = { name: "Ada", age: 36, address: { city: "London" } };

	test("valid data is written, defaults still apply", async () => {
		const rec = await make().create("person").content(ok).only();
		expect(rec.role).toBe("member");
		expect(rec).toBeInstanceOf(Person);
	});

	test("invalid data is rejected before reaching the database", async () => {
		const db = make();
		const error = await db
			.create("person")
			.content({ name: 1, age: "x", address: { city: 2 } } as never)
			.execute()
			.catch((e) => e);
		expect(error).toBeInstanceOf(ValidationError);
		expect((error as ValidationError).issues.map((i) => i.path)).toEqual([
			"name",
			"age",
			"address.city",
		]);
		expect(await db.select("person")).toHaveLength(1);
	});

	test("without validation the database is the only judge", async () => {
		const raw = orm(getTestDb().surreal, person);
		// Schemaless table: SurrealDB stores the wrong type without complaint.
		await raw
			.create("person", "sloppy")
			.content({ ...ok, age: "old" } as never)
			.return("none");
		await raw.delete("person", "sloppy");
	});

	test("update, upsert, insert and batch validate too", async () => {
		const db = make();
		const id = new RecordId("person", "grace");
		await db.create("person", "grace").content(ok);
		await expect(
			db
				.update(id)
				.merge({ age: "x" } as never)
				.execute(),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			db
				.upsert(id)
				.set({ "address.city": 5 } as never)
				.execute(),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			db.insert("person", [ok, { ...ok, name: null }]).execute(),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			db
				.batch(
					db.update(id).merge({ age: 1 }),
					db.update(id).set({ age: "z" } as never),
				)
				.execute(),
		).rejects.toBeInstanceOf(ValidationError);
		const [grace] = await db.select("person", "grace");
		expect(grace?.age).toBe(36);
	});

	test("valid partial updates go through, and work inside a transaction", async () => {
		const db = make();
		await db.update("person", "grace").merge({ age: 37 });
		await db.transaction(async (tx) => {
			await tx.update("person", "grace").set({ age: { "+=": 1 } });
			await expect(
				tx
					.update("person", "grace")
					.set({ age: "bad" } as never)
					.execute(),
			).rejects.toBeInstanceOf(ValidationError);
		});
		const [grace] = await db.select("person", "grace");
		expect(grace?.age).toBe(38);
	});

	test("safeParse agrees with what a row read back looks like", async () => {
		const [grace] = await make().select("person", "grace");
		expect(person.safeParse(grace, { mode: "row" }).success).toBe(true);
	});
});
