import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { edge, expr, orm, t, table } from "../../src";
import { withTestDb } from "./setup";

const item = table("item", {
	name: t.string(),
	done: t.bool().default(false),
	priority: t.number().default(() => 5),
	label: t.string().default("untitled"),
	created: t.date().default(expr("time::now()")),
});

describe("field defaults integration tests", () => {
	const getTestDb = withTestDb();

	const make = () => orm(getTestDb().surreal, item);

	test("CREATE with CONTENT applies defaults, output is complete", async () => {
		const rec = await make()
			.create("item")
			.content({ name: "a" })
			.only()
			.execute();
		expect(rec.done).toBe(false);
		expect(rec.priority).toBe(5);
		expect(rec.label).toBe("untitled");
		expect(rec.created).toBeInstanceOf(Date);
	});

	test("explicit values win over defaults", async () => {
		const rec = await make()
			.create("item")
			.content({ name: "b", done: true, label: "x" })
			.only()
			.execute();
		expect(rec.done).toBe(true);
		expect(rec.label).toBe("x");
		expect(rec.priority).toBe(5);
	});

	test("CREATE with SET applies defaults", async () => {
		const rec = await make()
			.create("item")
			.set({ name: "c", priority: 1 })
			.only()
			.execute();
		expect(rec.priority).toBe(1);
		expect(rec.label).toBe("untitled");
		expect(rec.created).toBeInstanceOf(Date);
	});

	test("bare CREATE applies defaults", async () => {
		const rec = await make()
			.create("item")
			.return((r) => ({ done: r.done, label: r.label }))
			.only()
			.execute();
		expect(rec).toEqual({ done: false, label: "untitled" });
	});

	test("INSERT applies defaults for object and values styles", async () => {
		const rows = await make()
			.insert("item", [{ name: "d" }, { name: "e", done: true }])
			.execute();
		expect(rows.map((r) => r.done)).toEqual([false, true]);
		expect(rows.every((r) => r.created instanceof Date)).toBe(true);

		const valued = await make()
			.insert("item")
			.fields(["name"])
			.values(["f"])
			.execute();
		expect(valued[0]!.label).toBe("untitled");
		expect(valued[0]!.created).toBeInstanceOf(Date);
	});
});

describe("field defaults on edges (RELATE)", () => {
	const person = table("person", { name: t.string() });
	const follows = edge("person", "follows", "person", {
		weight: t.number().default(1),
		label: t.string().default("follows"),
	});

	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await surreal.query(`
				CREATE person:a SET name = "a";
				CREATE person:b SET name = "b";
			`);
		},
	});

	test("RELATE with an empty CONTENT applies the edge defaults", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, person, follows);

		const [edgeRow] = await db
			.relate(
				"follows",
				new RecordId("person", "a"),
				new RecordId("person", "b"),
			)
			.content({})
			.execute();

		expect(edgeRow?.weight).toBe(1);
		expect(edgeRow?.label).toBe("follows");
	});

	test("RELATE with SET applies the edge defaults for the fields not set", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, person, follows);

		const [edgeRow] = await db
			.relate(
				"follows",
				new RecordId("person", "a"),
				new RecordId("person", "b"),
			)
			.set({ label: "knows" })
			.execute();

		expect(edgeRow?.weight).toBe(1);
		expect(edgeRow?.label).toBe("knows");
	});

	test("RELATE with CONTENT keeps explicit values over the defaults", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, person, follows);

		const [edgeRow] = await db
			.relate(
				"follows",
				new RecordId("person", "a"),
				new RecordId("person", "b"),
			)
			.content({ weight: 5 })
			.execute();

		expect(edgeRow?.weight).toBe(5);
		expect(edgeRow?.label).toBe("follows");
	});
});

describe("defaults and undefined values", () => {
	const getTestDb = withTestDb({ perTest: true });
	const make = () => orm(getTestDb().surreal, item);

	test(".content() with a key set to undefined applies the default", async () => {
		const rec = await make()
			.create("item")
			.content({ name: "a", done: undefined })
			.only()
			.execute();
		expect(rec.done).toBe(false);
	});

	test(".set() with a key set to undefined does not apply the default", async () => {
		const rec = await make()
			.create("item")
			.set({ name: "a", done: undefined })
			.only()
			.execute();
		expect(rec.done).toBeUndefined();
	});

	test(".merge() with a key set to undefined applies the default", async () => {
		const rec = await make()
			.create("item")
			.merge({ name: "a", done: undefined })
			.only()
			.execute();
		expect(rec.done).toBe(false);
	});

	test("INSERT object form with a key set to undefined applies the default", async () => {
		const [rec] = await make()
			.insert("item", [{ name: "a", done: undefined }])
			.execute();
		expect(rec?.done).toBe(false);
	});

	test("INSERT values form with an undefined cell applies the default", async () => {
		const [rec] = await make()
			.insert("item")
			.fields(["name", "done"])
			.values(["a", undefined])
			.execute();
		expect(rec?.done).toBe(false);
	});

	test(".set() with the key omitted applies the default", async () => {
		const rec = await make().create("item").set({ name: "a" }).only().execute();
		expect(rec.done).toBe(false);
	});
});
