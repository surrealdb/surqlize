import { expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import { edge, orm, t, table } from "../../../src";

// Compile-time equality assertion helper.
type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;
const assertType = <_T extends true>() => {};

// `email` is required, `nickname` is optional, `role` and `joined` have defaults.
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

/*
 * These functions are never called. The assertions are checked by the compiler
 * (`bun run type-check`), so a wrong result type fails the type check.
 */
const db = orm(new Surreal(), member, knows);

async function createResults() {
	// CREATE .set() and .merge(): written fields, defaults and option fields.
	const viaSet = await db.create("member").set({ name: "Ada" }).execute();
	type ViaSet = (typeof viaSet)[number];
	assertType<
		Equal<keyof ViaSet, "id" | "name" | "nickname" | "role" | "joined">
	>();
	assertType<Equal<ViaSet["name"], string>>();
	assertType<Equal<ViaSet["role"], string>>();
	// @ts-expect-error email is not written, so it is not guaranteed present
	viaSet[0]!.email;

	const viaMerge = await db.create("member").merge({ name: "Ada" }).execute();
	type ViaMerge = (typeof viaMerge)[number];
	assertType<
		Equal<keyof ViaMerge, "id" | "name" | "nickname" | "role" | "joined">
	>();

	// CREATE .replace(): REPLACE does not apply defaults.
	const viaReplace = await db.create("member").replace({ name: "Ada" }).execute();
	type ViaReplace = (typeof viaReplace)[number];
	assertType<Equal<keyof ViaReplace, "id" | "name" | "nickname">>();

	// CREATE .patch(): paths are plain strings, so nothing but id is guaranteed.
	const viaPatch = await db
		.create("member")
		.patch([{ op: "add", path: "/name", value: "Ada" }])
		.execute();
	type ViaPatch = (typeof viaPatch)[number];
	assertType<Equal<ViaPatch["id"], RecordId<"member">>>();
	assertType<Equal<ViaPatch["email"], string | undefined>>();

	// CREATE with no data: defaults are applied, nothing else is guaranteed.
	const noData = await db.create("member").execute();
	type NoData = (typeof noData)[number];
	assertType<Equal<keyof NoData, "id" | "nickname" | "role" | "joined">>();

	// CREATE .content() with every required field: the full row, as before.
	const viaContent = await db
		.create("member")
		.content({ name: "Ada", email: "ada@example.com" })
		.execute();
	type ViaContent = (typeof viaContent)[number];
	assertType<Equal<ViaContent["email"], string>>();
	assertType<Equal<ViaContent["role"], string>>();

	// .return() projections only see the fields the write guarantees.
	const projected = await db
		.create("member")
		.set({ name: "Ada" })
		// @ts-expect-error email is not written, so the projection cannot read it
		.return((m) => ({ name: m.name, email: m.email }))
		.execute();
	void projected;
}

/*
 * A key whose value may be `undefined` may not be present in the record. A
 * `.set()` with such a key leaves the field out, and a `.default()` is not
 * applied to a key that was passed, even as `undefined`.
 */
async function maybeWrittenResults(maybeEmail: string | undefined) {
	const partial: Partial<{ name: string; email: string }> = {};

	const fromPartial = await db.create("member").set(partial).execute();
	type FromPartial = (typeof fromPartial)[number];
	assertType<Equal<FromPartial["name"], string | undefined>>();

	const fromMaybe = await db
		.create("member")
		.set({ name: "Ada", email: maybeEmail })
		.execute();
	type FromMaybe = (typeof fromMaybe)[number];
	assertType<Equal<FromMaybe["name"], string>>();
	assertType<Equal<FromMaybe["email"], string | undefined>>();

	const defaultMaybe = await db
		.create("member")
		.set({ name: "Ada", email: "a@x", role: undefined as string | undefined })
		.execute();
	type DefaultMaybe = (typeof defaultMaybe)[number];
	assertType<Equal<DefaultMaybe["role"], string | undefined>>();

	const mergedMaybe = await db
		.create("member")
		.merge({ name: "Ada", email: maybeEmail })
		.execute();
	type MergedMaybe = (typeof mergedMaybe)[number];
	assertType<Equal<MergedMaybe["email"], string | undefined>>();

	const updated = await db
		.update("member", "a")
		.set({ role: maybeEmail as string | undefined })
		.execute();
	type Updated = (typeof updated)[number];
	assertType<Equal<Updated["role"], string | undefined>>();
}

async function updateResults() {
	// UPDATE .set(): the written field is required, the rest may be absent.
	const viaSet = await db
		.update("member", "a")
		.set({ role: "admin" })
		.execute();
	type ViaSet = (typeof viaSet)[number];
	assertType<Equal<ViaSet["role"], string>>();
	assertType<Equal<ViaSet["name"], string | undefined>>();
	assertType<Equal<ViaSet["id"], RecordId<"member">>>();

	// UPDATE .merge() follows the same rule.
	const viaMerge = await db
		.update("member", "a")
		.merge({ role: "admin" })
		.execute();
	type ViaMerge = (typeof viaMerge)[number];
	assertType<Equal<ViaMerge["role"], string>>();
	assertType<Equal<ViaMerge["name"], string | undefined>>();

	// UPDATE .content() and .replace() replace the record, so only given fields remain.
	const viaContent = await db
		.update("member", "a")
		.content({ name: "Ada" })
		.execute();
	type ViaContent = (typeof viaContent)[number];
	assertType<Equal<keyof ViaContent, "id" | "name">>();

	const viaReplace = await db
		.update("member", "a")
		.replace({ name: "Ada" })
		.execute();
	type ViaReplace = (typeof viaReplace)[number];
	assertType<Equal<keyof ViaReplace, "id" | "name">>();

	// UNSET removes fields from the result.
	const unset = await db
		.update("member", "a")
		.set({ role: "admin" })
		.unset(["nickname"])
		.execute();
	// @ts-expect-error nickname was unset, so it is not in the result
	unset[0]!.nickname;

	// UPDATE with no data: nothing is guaranteed beyond id.
	const noData = await db.update("member", "a").execute();
	type NoData = (typeof noData)[number];
	assertType<Equal<NoData["name"], string | undefined>>();
	assertType<Equal<NoData["id"], RecordId<"member">>>();

	// RETURN BEFORE: the previous state may not have the written fields.
	const before = await db
		.update("member", "a")
		.set({ role: "admin" })
		.return("before")
		.execute();
	type Before = (typeof before)[number];
	assertType<Equal<Before["role"], string | undefined>>();

	// UPDATE .return() with a projection: an unwritten field may be there, so it is optional.
	const projectedUpdate = await db
		.update("member", "a")
		.set({ role: "admin" })
		.return((m) => ({ role: m.role, name: m.name }))
		.execute();
	type ProjectedUpdate = (typeof projectedUpdate)[number];
	assertType<Equal<ProjectedUpdate["role"], string>>();
	assertType<Equal<ProjectedUpdate["name"], string | undefined>>();
}

async function upsertResults() {
	const viaSet = await db
		.upsert("member", "a")
		.set({ role: "admin" })
		.execute();
	type ViaSet = (typeof viaSet)[number];
	assertType<Equal<ViaSet["role"], string>>();
	assertType<Equal<ViaSet["name"], string | undefined>>();

	const viaContent = await db
		.upsert("member", "a")
		.content({ name: "Ada" })
		.execute();
	type ViaContent = (typeof viaContent)[number];
	assertType<Equal<keyof ViaContent, "id" | "name">>();
}

async function relateResults() {
	const from = new RecordId("member", "a");
	const to = new RecordId("member", "b");

	// RELATE .set(): in and out always exist, and nothing else is guaranteed.
	const viaSet = await db.relate("knows", from, to).set({ since: new Date() }).execute();
	type ViaSet = (typeof viaSet)[number];
	assertType<Equal<keyof ViaSet, "id" | "in" | "out" | "since">>();
	// @ts-expect-error weight is required by the edge but was not written
	viaSet[0]!.weight;

	// RELATE .content() with the full edge: the full row, as before.
	const viaContent = await db
		.relate("knows", from, to)
		.content({ since: new Date(), weight: 3 })
		.execute();
	type ViaContent = (typeof viaContent)[number];
	assertType<Equal<ViaContent["weight"], number>>();
}

async function unchangedResults() {
	// DELETE and SELECT still return the full row.
	const deleted = await db.delete("member", "a").return("before").execute();
	type Deleted = (typeof deleted)[number];
	assertType<Equal<Deleted["email"], string>>();

	const selected = await db.select("member").execute();
	type Selected = (typeof selected)[number];
	assertType<Equal<Selected["email"], string>>();
}

test("partial write result types are checked by the compiler", () => {
	expect(typeof createResults).toBe("function");
	expect(typeof maybeWrittenResults).toBe("function");
	expect(typeof updateResults).toBe("function");
	expect(typeof upsertResults).toBe("function");
	expect(typeof relateResults).toBe("function");
	expect(typeof unchangedResults).toBe("function");
});
