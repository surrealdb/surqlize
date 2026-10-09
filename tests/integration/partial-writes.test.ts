import { describe, expect, test } from "bun:test";
import { RecordId, type Surreal } from "surrealdb";
import {
	edge,
	orm,
	TypeParseError,
	t,
	table,
	ValidationError,
} from "../../src";
import { withTestDb } from "./setup";

// `email` is required and `nickname` is optional. `role` and `joined` have
// defaults, which CREATE applies. A partial write that leaves `email` unset used
// to store the record and then throw while parsing the result.
const member = table("member", {
	name: t.string(),
	email: t.string(),
	nickname: t.option(t.string()),
	role: t.string().default("guest"),
	joined: t.date().default(() => new Date()),
});

const knows = edge("member", "knows", "member", {
	since: t.date(),
	weight: t.number(),
});

/** SurrealDB 3 rejects reads from a table that does not exist yet. */
async function defineTables({ surreal }: { surreal: Surreal }) {
	await surreal.query(
		"DEFINE TABLE IF NOT EXISTS member; DEFINE TABLE IF NOT EXISTS knows;",
	);
}

/** Read a record exactly as stored, bypassing the ORM's parse. */
async function stored(surreal: Surreal, id: string) {
	const [rows] = await surreal.query<[Record<string, unknown>[]]>(
		`SELECT * FROM ${id}`,
	);
	return rows[0];
}

describe("partial CREATE writes do not throw after committing", () => {
	const getTestDb = withTestDb({ setup: defineTables });
	const make = () => orm(getTestDb().surreal, member, knows);

	test("set() without the required email stores the record and returns it", async () => {
		const db = make();
		const [row] = await db
			.create("member", "set_partial")
			.set({ name: "Ada" })
			.execute();

		expect(row!.id.toString()).toBe("member:set_partial");
		expect(row!.name).toBe("Ada");
		expect(row!.role).toBe("guest");
		expect(row!.joined).toBeInstanceOf(Date);

		const raw = await stored(getTestDb().surreal, "member:set_partial");
		expect(raw?.name).toBe("Ada");
		expect(raw && "email" in raw).toBe(false);
	});

	test("merge() without the required email does not throw", async () => {
		const db = make();
		const [row] = await db
			.create("member", "merge_partial")
			.merge({ name: "Grace" })
			.execute();

		expect(row!.name).toBe("Grace");
		expect(row!.role).toBe("guest");
		expect(
			(await stored(getTestDb().surreal, "member:merge_partial"))?.name,
		).toBe("Grace");
	});

	test("replace() without the required email does not throw", async () => {
		const db = make();
		const [row] = await db
			.create("member", "replace_partial")
			.replace({ name: "Linus" })
			.execute();

		expect(row!.name).toBe("Linus");
		// Defaults are not applied by REPLACE, so the field is absent.
		expect((row as Record<string, unknown>).role).toBeUndefined();
	});

	test("patch() without the required email does not throw", async () => {
		const db = make();
		const [row] = await db
			.create("member", "patch_partial")
			.patch([{ op: "add", path: "/name", value: "Margaret" }])
			.execute();

		expect(row!.id.toString()).toBe("member:patch_partial");
		expect(row!.name).toBe("Margaret");
	});

	test("create() with no data does not throw and applies defaults", async () => {
		const db = make();
		const [row] = await db.create("member", "no_data").execute();

		expect(row!.id.toString()).toBe("member:no_data");
		expect(row!.role).toBe("guest");
	});

	test("set() with every required field still returns the full row", async () => {
		const db = make();
		const [row] = await db
			.create("member", "set_full")
			.set({ name: "Full", email: "full@example.com" })
			.execute();

		expect(row!.name).toBe("Full");
		expect(row!.email).toBe("full@example.com");
	});

	test("content() with every required field returns the full row", async () => {
		const db = make();
		const [row] = await db
			.create("member", "content_full")
			.content({ name: "Content", email: "content@example.com" })
			.execute();

		expect(row!.email).toBe("content@example.com");
		expect(row!.role).toBe("guest");
	});

	test("set() with return('after') does not throw", async () => {
		const db = make();
		const rows = await db
			.create("member", "after_partial")
			.set({ name: "After" })
			.return("after")
			.execute();

		expect(rows[0]!.name).toBe("After");
	});

	test("set() with return('before') does not throw", async () => {
		const db = make();
		await expect(
			db
				.create("member", "before_partial")
				.set({ name: "Before" })
				.return("before")
				.execute(),
		).resolves.toBeDefined();
	});

	test("set() with return('none') does not throw", async () => {
		const db = make();
		const rows = await db
			.create("member", "none_partial")
			.set({ name: "None" })
			.return("none")
			.execute();

		expect(rows).toEqual([]);
	});

	test("set() with a projection returns the projected written fields", async () => {
		const db = make();
		const rows = await db
			.create("member", "proj_partial")
			.set({ name: "Proj" })
			.return((m) => ({ name: m.name }))
			.execute();

		expect(rows[0]!.name).toBe("Proj");
	});

	test("only() returns a single partial row", async () => {
		const db = make();
		const row = await db
			.create("member", "only_partial")
			.only()
			.set({ name: "Only" })
			.execute();

		expect(row.name).toBe("Only");
		expect(row.id.toString()).toBe("member:only_partial");
	});

	test("set() with a key passed as undefined does not throw and leaves the field out", async () => {
		const db = make();
		const maybeEmail: string | undefined = undefined;
		const [row] = await db
			.create("member", "undef_partial")
			.set({ name: "Undef", email: maybeEmail })
			.execute();

		expect(row!.name).toBe("Undef");
		expect(row!.email).toBeUndefined();
		expect(
			(await stored(getTestDb().surreal, "member:undef_partial"))?.name,
		).toBe("Undef");
	});

	test("set() passing a defaulted field as undefined does not apply its default", async () => {
		const db = make();
		const maybeRole: string | undefined = undefined;
		const [row] = await db
			.create("member", "undef_default")
			.set({ name: "Undef", role: maybeRole })
			.execute();

		expect(row!.name).toBe("Undef");
		expect(row!.role).toBeUndefined();
	});

	test("set() called twice keeps both written fields", async () => {
		const db = make();
		const [row] = await db
			.create("member", "twice_partial")
			.set({ name: "Twice" })
			.set({ nickname: "tw" })
			.execute();

		expect(row!.name).toBe("Twice");
		expect(row!.nickname).toBe("tw");
	});
});

describe("partial UPDATE and UPSERT writes do not throw after committing", () => {
	const getTestDb = withTestDb({ setup: defineTables });
	const make = () => orm(getTestDb().surreal, member, knows);

	/** Create a record that is missing `email`, as a partial write now can. */
	async function partial(db: ReturnType<typeof make>, id: string) {
		await db.create("member", id).set({ name: "Partial" }).execute();
	}

	test("update().set() on a partial record returns the written field", async () => {
		const db = make();
		await partial(db, "upd_set");
		const [row] = await db
			.update("member", "upd_set")
			.set({ nickname: "u" })
			.execute();

		expect(row!.nickname).toBe("u");
		expect(row!.name).toBe("Partial");
	});

	test("update().set() on a complete record returns the whole row", async () => {
		const db = make();
		await db
			.create("member", "upd_complete")
			.content({ name: "Full", email: "full@example.com" })
			.execute();
		const [row] = await db
			.update("member", "upd_complete")
			.set({ nickname: "u" })
			.execute();

		expect(row!.email).toBe("full@example.com");
		expect(row!.nickname).toBe("u");
	});

	test("update().merge() on a partial record does not throw", async () => {
		const db = make();
		await partial(db, "upd_merge");
		const [row] = await db
			.update("member", "upd_merge")
			.merge({ nickname: "m" })
			.execute();

		expect(row!.nickname).toBe("m");
	});

	test("update().replace() on a partial record does not throw", async () => {
		const db = make();
		await partial(db, "upd_replace");
		const [row] = await db
			.update("member", "upd_replace")
			.replace({ name: "Replaced" })
			.execute();

		expect(row!.name).toBe("Replaced");
	});

	test("update().content() with partial data replaces the record without throwing", async () => {
		const db = make();
		await db
			.create("member", "upd_content")
			.content({ name: "Old", email: "old@example.com" })
			.execute();
		const [row] = await db
			.update("member", "upd_content")
			.content({ name: "New" })
			.execute();

		expect(row!.name).toBe("New");
		// CONTENT replaces the record, so the old email is gone.
		expect((row as Record<string, unknown>).email).toBeUndefined();
	});

	test("update().patch() on a partial record does not throw", async () => {
		const db = make();
		await partial(db, "upd_patch");
		const [row] = await db
			.update("member", "upd_patch")
			.patch([{ op: "add", path: "/nickname", value: "p" }])
			.execute();

		expect(row!.nickname).toBe("p");
	});

	test("update().unset() on a partial record does not throw", async () => {
		const db = make();
		await partial(db, "upd_unset");
		const [row] = await db
			.update("member", "upd_unset")
			.set({ nickname: "x" })
			.unset(["nickname"])
			.execute();

		expect(row!.name).toBe("Partial");
		expect((row as Record<string, unknown>).nickname).toBeUndefined();
	});

	test("update() with return('before') on a partial record does not throw", async () => {
		const db = make();
		await partial(db, "upd_before");
		await expect(
			db
				.update("member", "upd_before")
				.set({ nickname: "b" })
				.return("before")
				.execute(),
		).resolves.toBeDefined();
	});

	test("update() with no data on a partial record does not throw", async () => {
		const db = make();
		await partial(db, "upd_nodata");
		const [row] = await db.update("member", "upd_nodata").execute();

		expect(row!.name).toBe("Partial");
	});

	test("upsert().set() creating a new partial record does not throw", async () => {
		const db = make();
		const [row] = await db
			.upsert("member", "ups_new")
			.set({ name: "Upserted" })
			.execute();

		expect(row!.name).toBe("Upserted");
		expect((await stored(getTestDb().surreal, "member:ups_new"))?.email).toBe(
			undefined,
		);
	});

	test("upsert().set() updating a partial record does not throw", async () => {
		const db = make();
		await partial(db, "ups_existing");
		const [row] = await db
			.upsert("member", "ups_existing")
			.set({ nickname: "again" })
			.execute();

		expect(row!.nickname).toBe("again");
	});

	test("upsert().content() with partial data does not throw", async () => {
		const db = make();
		const [row] = await db
			.upsert("member", "ups_content")
			.content({ name: "C" })
			.execute();

		expect(row!.name).toBe("C");
	});
});

describe("INSERT ... ON DUPLICATE KEY UPDATE on a partial record", () => {
	const getTestDb = withTestDb({ setup: defineTables });
	const make = () => orm(getTestDb().surreal, member, knows);

	test("updating an existing partial record does not throw", async () => {
		const db = make();
		await db.create("member", "dup_partial").set({ name: "Partial" }).execute();

		const rows = await db
			.insert("member", {
				id: new RecordId("member", "dup_partial"),
				name: "Dup",
				email: "dup@example.com",
			})
			.onDuplicate({ nickname: "dup" })
			.execute();

		expect(rows[0]!.id.toString()).toBe("member:dup_partial");
		expect(rows[0]!.nickname).toBe("dup");
	});
});

describe("DELETE returns rows as stored", () => {
	const getTestDb = withTestDb({ setup: defineTables });
	const make = () => orm(getTestDb().surreal, member, knows);

	test("delete().return('before') on a complete record returns the row", async () => {
		const db = make();
		await db
			.create("member", "del_complete")
			.content({ name: "Gone", email: "gone@example.com" })
			.execute();
		const [row] = await db
			.delete("member", "del_complete")
			.return("before")
			.execute();

		expect(row!.email).toBe("gone@example.com");
	});
});

describe("partial RELATE writes do not throw after committing", () => {
	const getTestDb = withTestDb({ setup: defineTables });
	const make = () => orm(getTestDb().surreal, member, knows);

	test("relate().set() without the required weight does not throw", async () => {
		const db = make();
		const from = new RecordId("member", "rel_a");
		const to = new RecordId("member", "rel_b");
		await db
			.create("member", "rel_a")
			.content({ name: "A", email: "a@x" })
			.execute();
		await db
			.create("member", "rel_b")
			.content({ name: "B", email: "b@x" })
			.execute();

		const [edge] = await db
			.relate("knows", from, to)
			.set({ since: new Date() })
			.execute();

		expect(edge!.since).toBeInstanceOf(Date);
		expect(edge!.in.toString()).toBe("member:rel_a");
		expect(edge!.out.toString()).toBe("member:rel_b");
	});

	test("relate().content() with every required field returns the full edge", async () => {
		const db = make();
		const from = new RecordId("member", "rel_c");
		const to = new RecordId("member", "rel_d");
		await db
			.create("member", "rel_c")
			.content({ name: "C", email: "c@x" })
			.execute();
		await db
			.create("member", "rel_d")
			.content({ name: "D", email: "d@x" })
			.execute();

		const [edge] = await db
			.relate("knows", from, to)
			.content({ since: new Date(), weight: 3 })
			.execute();

		expect(edge!.weight).toBe(3);
	});
});

describe("validated() still checks partial writes", () => {
	const getTestDb = withTestDb({ setup: defineTables });
	const make = () => orm(getTestDb().surreal, member, knows).validated();

	test("set() with a wrongly typed value is rejected before sending", async () => {
		const db = make();
		await expect(
			db
				.create("member", "val_bad")
				.set({ name: 42 as unknown as string })
				.execute(),
		).rejects.toThrow(ValidationError);
		expect(await stored(getTestDb().surreal, "member:val_bad")).toBeUndefined();
	});

	test("set() leaving out a required field is not rejected", async () => {
		const db = make();
		const [row] = await db
			.create("member", "val_partial")
			.set({ name: "Valid" })
			.execute();

		expect(row!.name).toBe("Valid");
	});

	test("content() leaving out a required field is still rejected", async () => {
		const db = make();
		await expect(
			db
				.create("member", "val_content")
				.content({ name: "NoEmail" } as never)
				.execute(),
		).rejects.toThrow(ValidationError);
	});

	test("update().set() with a wrongly typed value is rejected", async () => {
		const db = make();
		await db.create("member", "val_upd").set({ name: "V" }).execute();
		await expect(
			db
				.update("member", "val_upd")
				.set({ nickname: 7 as unknown as string })
				.execute(),
		).rejects.toThrow(ValidationError);
	});
});

describe("partial writes inside batch()", () => {
	const getTestDb = withTestDb({ setup: defineTables });
	const make = () => orm(getTestDb().surreal, member, knows);

	test("a partial create() in a batch does not throw after committing", async () => {
		const db = make();
		const [created] = await db.batch(
			db.create("member", "batch_partial").set({ name: "Batch" }),
		);

		expect(created[0]!.name).toBe("Batch");
		expect(
			(await stored(getTestDb().surreal, "member:batch_partial"))?.name,
		).toBe("Batch");
	});
});

describe("select is unchanged", () => {
	const getTestDb = withTestDb({ setup: defineTables });
	const make = () => orm(getTestDb().surreal, member, knows);

	test("select() of a partial record still parses strictly", async () => {
		const db = make();
		await db.create("member", "sel_partial").set({ name: "Sel" }).execute();

		await expect(db.select("member", "sel_partial").execute()).rejects.toThrow(
			TypeParseError,
		);
	});
});
