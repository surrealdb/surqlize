import { describe, expect, test } from "bun:test";
import { expr, orm, t, table } from "../../src";
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
