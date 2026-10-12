import { describe, expect, test } from "bun:test";
import { RecordId, type Surreal } from "surrealdb";
import { edge, orm, t, table } from "../../src";
import { withTestDb } from "./setup";

const member = table("member", {
	name: t.string(),
	email: t.string(),
});

const knows = edge("member", "knows", "member", {
	weight: t.number(),
	label: t.string(),
});

const from = new RecordId("member", "ra");
const to = new RecordId("member", "rb");

async function setup({ surreal }: { surreal: Surreal }) {
	await surreal.query(`
		DEFINE TABLE IF NOT EXISTS member;
		DEFINE TABLE IF NOT EXISTS knows;
		CREATE member:ra SET name = "A", email = "a@x";
		CREATE member:rb SET name = "B", email = "b@x";
	`);
}

/** The number of edges stored, read past the ORM. */
async function countEdges(surreal: Surreal): Promise<number> {
	const [rows] = await surreal.query<[unknown[]]>("SELECT * FROM knows");
	return rows.length;
}

describe("relate().return() modes on a new edge", () => {
	const getTestDb = withTestDb({ perTest: true, setup });

	test('return("none") resolves to no rows and still stores the edge', async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, member, knows);

		const rows = await db
			.relate("knows", from, to)
			.set({ weight: 1, label: "x" })
			.return("none")
			.execute();

		expect(rows).toEqual([]);
		expect(await countEdges(surreal)).toBe(1);
	});

	test('return("before") with set() resolves to one empty entry per edge', async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, member, knows);

		const rows = await db
			.relate("knows", from, to)
			.set({ weight: 1, label: "x" })
			.return("before")
			.execute();

		// There is no before-state for a new edge: the server returns NONE.
		expect(rows).toEqual([undefined]);
		expect(await countEdges(surreal)).toBe(1);
	});

	test('return("before") with content() does not throw', async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, member, knows);

		const rows = await db
			.relate("knows", from, to)
			.content({ weight: 2, label: "y" })
			.return("before")
			.execute();

		expect(rows).toEqual([undefined]);
		expect(await countEdges(surreal)).toBe(1);
	});

	test('return("after") resolves to the stored edge', async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, member, knows);

		const rows = await db
			.relate("knows", from, to)
			.set({ weight: 3, label: "z" })
			.return("after")
			.execute();

		expect(rows).toHaveLength(1);
		expect(rows[0]!.weight).toBe(3);
		expect(rows[0]!.in.toString()).toBe("member:ra");
		expect(rows[0]!.out.toString()).toBe("member:rb");
	});

	test('only() with return("none") resolves to nothing', async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, member, knows);

		const row = await db
			.relate("knows", from, to)
			.set({ weight: 1, label: "x" })
			.only()
			.return("none")
			.execute();

		expect(row).toBeUndefined();
		expect(await countEdges(surreal)).toBe(1);
	});

	test('only() with return("before") resolves to nothing', async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, member, knows);

		const row = await db
			.relate("knows", from, to)
			.content({ weight: 2, label: "y" })
			.only()
			.return("before")
			.execute();

		expect(row).toBeUndefined();
	});

	test('only() with return("after") resolves to the stored edge', async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, member, knows);

		const row = await db
			.relate("knows", from, to)
			.set({ weight: 4, label: "w" })
			.only()
			.return("after")
			.execute();

		expect(row?.weight).toBe(4);
	});
});
