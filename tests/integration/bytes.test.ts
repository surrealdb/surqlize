import { describe, expect, test } from "bun:test";
import { orm, t, table } from "../../src";
import { withTestDb } from "./setup";

const blob = table("blob", {
	name: t.string(),
	data: t.bytes(),
	maybe: t.option(t.bytes()),
	parts: t.array(t.bytes()),
	nested: t.object({ inner: t.bytes() }),
});

describe("bytes round trip", () => {
	const getTestDb = withTestDb();

	const make = () => orm(getTestDb().surreal, blob);

	const row = (name: string, data: number[]) => ({
		name,
		data: new Uint8Array(data),
		parts: [new Uint8Array([9]), new Uint8Array([8, 7])],
		nested: { inner: new Uint8Array([4, 5]) },
	});

	test("a row with a bytes field can be selected", async () => {
		const db = make();
		await db
			.create("blob", "a")
			.content(row("a", [1, 2, 3]))
			.execute();

		const rows = await db.select("blob").execute();
		const found = rows.find((r) => r.name === "a");
		expect(found?.data).toBeInstanceOf(Uint8Array);
		expect([...(found?.data ?? [])]).toEqual([1, 2, 3]);
		expect(rows.every((r) => r.data instanceof Uint8Array)).toBe(true);
	});

	test("bytes inside an option, an array and an object come back as Uint8Array", async () => {
		const db = make();
		await db
			.create("blob", "b")
			.content({ ...row("b", [1]), maybe: new Uint8Array([6]) })
			.execute();

		const found = await db.select("blob", "b").only().execute();
		expect(found.maybe).toBeInstanceOf(Uint8Array);
		expect([...(found.maybe ?? [])]).toEqual([6]);
		expect(found.parts.every((p) => p instanceof Uint8Array)).toBe(true);
		expect(found.parts.map((p) => [...p])).toEqual([[9], [8, 7]]);
		expect(found.nested.inner).toBeInstanceOf(Uint8Array);
		expect([...found.nested.inner]).toEqual([4, 5]);
	});

	test("an absent optional bytes field stays undefined", async () => {
		const db = make();
		await db
			.create("blob", "c")
			.content(row("c", [2]))
			.execute();

		const found = await db.select("blob", "c").only().execute();
		expect(found.maybe).toBeUndefined();
	});

	test("an empty value round trips as an empty Uint8Array", async () => {
		const db = make();
		await db.create("blob", "d").content(row("d", [])).execute();

		const found = await db.select("blob", "d").only().execute();
		expect(found.data).toBeInstanceOf(Uint8Array);
		expect(found.data.byteLength).toBe(0);
	});

	test("a projected bytes field can be read", async () => {
		const db = make();
		await db
			.create("blob", "e")
			.content(row("e", [7, 8]))
			.execute();

		const found = await db
			.select("blob", "e")
			.return((r) => ({ data: r.data }))
			.only()
			.execute();
		expect(found.data).toBeInstanceOf(Uint8Array);
		expect([...found.data]).toEqual([7, 8]);
	});

	test("the row a create returns carries bytes as Uint8Array", async () => {
		const db = make();
		const created = await db
			.create("blob", "f")
			.content(row("f", [3, 4]))
			.only()
			.execute();
		expect(created.data).toBeInstanceOf(Uint8Array);
		expect([...created.data]).toEqual([3, 4]);
	});
});
