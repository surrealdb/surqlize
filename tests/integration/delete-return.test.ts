import { describe, expect, test } from "bun:test";
import type { Surreal } from "surrealdb";
import { orm, t, table } from "../../src";
import { withTestDb } from "./setup";

/**
 * `delete().return("after")`: the server reads the records after they are gone,
 * so it returns one NONE per deleted record (`undefined` here), not the rows.
 */

type Equal<A, B> =
	(<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2
		? true
		: false;
const assertType = <T extends true>() => undefined as unknown as T;

const member = table("member", {
	name: t.string(),
	email: t.string(),
});

async function setup({ surreal }: { surreal: Surreal }) {
	await surreal.query(`
		DEFINE TABLE IF NOT EXISTS member;
		CREATE member:da1 SET name = "A", email = "a@x";
		CREATE member:da2 SET name = "B", email = "b@x";
	`);
}

/** The number of members stored, read past the ORM. */
async function countMembers(surreal: Surreal): Promise<number> {
	const [rows] = await surreal.query<[unknown[]]>("SELECT * FROM member");
	return rows.length;
}

describe("delete().return('after') on the server", () => {
	const getTestDb = withTestDb({ perTest: true, setup });

	test("a bulk delete returns one undefined per deleted record", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, member);

		const rows = await db.delete("member").return("after").execute();

		expect(rows).toStrictEqual([undefined, undefined]);
		assertType<Equal<typeof rows, undefined[]>>();
		expect(await countMembers(surreal)).toBe(0);
	});

	test("only() gives undefined for the deleted record", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, member);

		const row = await db
			.delete("member", "da1")
			.only()
			.return("after")
			.execute();

		expect(row).toBeUndefined();
		assertType<Equal<typeof row, undefined>>();
		expect(await countMembers(surreal)).toBe(1);
	});

	test("a delete that matches nothing returns an empty array", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, member);

		const rows = await db
			.delete("member")
			.where(($this) => $this.name.eq("nobody"))
			.return("after")
			.execute();

		expect(rows).toStrictEqual([]);
		expect(await countMembers(surreal)).toBe(2);
	});
});
