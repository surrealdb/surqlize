import { describe, expect, test } from "bun:test";
import { type Orm, orm, t, table } from "../../src";
import { withTestDb } from "./setup";

// A computed field is derived by the server from an expression, so these tests
// define real `COMPUTED` fields. `COMPUTED` needs SurrealDB 3.0, which is the
// oldest version of the integration matrix.
const account = table("account", {
	first: t.string(),
	last: t.string(),
})
	.computed("fullName", t.string(), (row) => row.first.concat(" ", row.last))
	.computed("postCount", t.number(), (row, db: Orm<[typeof article]>) =>
		db
			.select("article")
			.where((a) => a.owner.eq(row.id))
			.return((a) => a.id)
			.wrap()
			.len(),
	);

const article = table("article", {
	title: t.string(),
	owner: t.record("account"),
});

describe("computed fields", () => {
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			const db = orm(surreal, account, article);
			// A computed field reads other tables, so they must exist first.
			await surreal.query("DEFINE TABLE article; DEFINE TABLE account;");
			await db.defineComputed();
			await surreal.query(`
				CREATE account:ada SET first = "Ada", last = "Lovelace";
				CREATE account:alan SET first = "Alan", last = "Turing";
				CREATE article:a1 SET title = "One", owner = account:ada;
				CREATE article:a2 SET title = "Two", owner = account:ada;
			`);
		},
	});

	const connect = () => {
		const { surreal } = getTestDb();
		return orm(surreal, account, article);
	};

	test("selects computed values alongside stored fields", async () => {
		const db = connect();
		const rows = await db.select("account").orderBy("first").execute();

		expect(rows.map((r) => [r.first, r.fullName, r.postCount])).toEqual([
			["Ada", "Ada Lovelace", 2],
			["Alan", "Alan Turing", 0],
		]);
	});

	test("recomputes when the data changes", async () => {
		const db = connect();
		await db.update("account", "alan").set({ last: "Mathison" });
		await db.create("article", "a3").set({
			title: "Three",
			owner: (await db.select("account", "alan").then.val())!.id,
		});

		const alan = await db.select("account", "alan").only().execute();
		expect(alan.fullName).toBe("Alan Mathison");
		expect(alan.postCount).toBe(1);
	});

	test("computed fields can be filtered, ordered and projected", async () => {
		const db = connect();

		const busy = await db
			.select("account")
			.where((a) => a.postCount.gt(0))
			.execute();
		expect(busy.map((r) => r.first)).toEqual(["Ada"]);

		const ordered = await db
			.select("account")
			.orderBy("postCount", "DESC")
			.return((a) => ({ name: a.fullName, n: a.postCount }))
			.execute();
		expect(ordered).toEqual([
			{ name: "Ada Lovelace", n: 2 },
			{ name: "Alan Turing", n: 0 },
		]);
	});

	test("created records come back with their computed fields", async () => {
		const db = connect();
		const [created] = await db
			.create("account", "grace")
			.set({ first: "Grace", last: "Hopper" })
			.execute();
		expect(created?.fullName).toBe("Grace Hopper");
	});

	test("defineComputed is idempotent and can target a table", async () => {
		const db = connect();
		await db.defineComputed("account");
		await db.defineComputed();
		const ada = await db.select("account", "ada").only().execute();
		expect(ada.fullName).toBe("Ada Lovelace");
	});
});
