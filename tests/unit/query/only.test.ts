import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import { __type, edge, orm, t, table } from "../../../src";

// Compile-time equality assertion helper.
type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;

const user = table("user", {
	name: t.string(),
	age: t.number(),
});

const post = table("post", {
	title: t.string(),
	author: t.record("user"),
});

const authored = edge("user", "authored", "post", {
	created: t.date(),
});

const db = orm(new Surreal(), user, post, authored);
type User = {
	id: RecordId<"user">;
	name: string;
	age: number;
};

describe("ONLY queries", () => {
	const aliceId = new RecordId("user", "alice");
	const postId = new RecordId("post", "post1");
	const alice: User = { id: aliceId, name: "Alice", age: 30 };

	const render = (query: { toString(): string }) => query.toString();

	test("renders ONLY for every supported builder", () => {
		const select = render(db.select("user", "alice").only());
		const create = render(db.create("user", "alice").only());
		const update = render(db.update("user", "alice").only());
		const upsert = render(db.upsert("user", "alice").only());
		const deleteQuery = render(
			db.delete("user", "alice").only().return("before"),
		);
		const relate = render(db.relate("authored", aliceId, postId).only());

		expect(select).toContain("FROM ONLY");
		expect(create).toContain("CREATE ONLY");
		expect(update).toContain("UPDATE ONLY");
		expect(upsert).toContain("UPSERT ONLY");
		expect(deleteQuery).toContain("DELETE ONLY");
		expect(deleteQuery).toContain("RETURN BEFORE");
		expect(relate).toContain("RELATE ONLY");
	});

	test("renders ONLY inside nested SELECT VALUE projections", () => {
		const query = db
			.select("post")
			.return((post) => post.author.select().only());
		const sql = render(query);

		expect(sql).toContain("SELECT VALUE");
		expect(sql).toContain("FROM ONLY");
	});

	test("SELECT keeps array results by default and only() returns one record", () => {
		const defaultSelect = db.select("user", "alice");
		const onlySelect = db.select("user", "alice").only();

		type DefaultResult = t.infer<typeof defaultSelect>;
		type OnlyResult = t.infer<typeof onlySelect>;

		const defaultCheck: Equal<DefaultResult, User[]> = true;
		const onlyCheck: Equal<OnlyResult, User> = true;

		expect(defaultCheck).toBe(true);
		expect(onlyCheck).toBe(true);
		expect(defaultSelect[__type].validate([alice])).toBe(true);
		expect(defaultSelect[__type].validate(alice)).toBe(false);
		expect(onlySelect[__type].validate(alice)).toBe(true);
		expect(onlySelect[__type].validate([alice])).toBe(false);
		expect(render(defaultSelect)).not.toContain("FROM ONLY");
	});

	test("mutation only() results are object-shaped", () => {
		const created = db.create("user", "alice").only();
		const updated = db.update("user", "alice").only();
		const upserted = db.upsert("user", "alice").only();
		const deleted = db.delete("user", "alice").only().return("before");

		type Created = t.infer<typeof created>;
		type Updated = t.infer<typeof updated>;
		type Upserted = t.infer<typeof upserted>;
		type Deleted = t.infer<typeof deleted>;

		const createdCheck: Equal<Created, User> = true;
		const updatedCheck: Equal<Updated, User> = true;
		const upsertedCheck: Equal<Upserted, User> = true;
		const deletedCheck: Equal<Deleted, User> = true;

		expect(createdCheck).toBe(true);
		expect(updatedCheck).toBe(true);
		expect(upsertedCheck).toBe(true);
		expect(deletedCheck).toBe(true);
		expect(created[__type].validate(alice)).toBe(true);
		expect(updated[__type].validate(alice)).toBe(true);
		expect(upserted[__type].validate(alice)).toBe(true);
		expect(deleted[__type].validate(alice)).toBe(true);
		expect(created[__type].validate([alice])).toBe(false);
		expect(updated[__type].validate([alice])).toBe(false);
		expect(upserted[__type].validate([alice])).toBe(false);
		expect(deleted[__type].validate([alice])).toBe(false);
	});

	test("nested record select only() does not add an extra array layer", () => {
		const query = db
			.select("post")
			.return((post) => post.author.select().only());
		type Result = t.infer<typeof query>;

		const resultCheck: Equal<Result, User[]> = true;

		expect(resultCheck).toBe(true);
		expect(query[__type].validate([alice])).toBe(true);
		expect(query[__type].validate([[alice]])).toBe(false);
	});

	test("only() preserves projection result types in either chain order", () => {
		const q1 = db
			.select("user", "alice")
			.only()
			.return((u) => ({ name: u.name }));
		const q2 = db
			.select("user", "alice")
			.return((u) => ({ name: u.name }))
			.only();

		type Q1Result = t.infer<typeof q1>;
		type Q2Result = t.infer<typeof q2>;

		const q1Check: Equal<Q1Result, { name: string }> = true;
		const q2Check: Equal<Q2Result, { name: string }> = true;

		expect(q1Check).toBe(true);
		expect(q2Check).toBe(true);
		expect(q1[__type].validate({ name: "Alice" })).toBe(true);
		expect(q2[__type].validate({ name: "Alice" })).toBe(true);
		expect(q1[__type].validate([{ name: "Alice" }])).toBe(false);
		expect(q2[__type].validate([{ name: "Alice" }])).toBe(false);
	});

	test("parseResult uses object shape for only() and array shape by default", () => {
		expect(db.select("user", "alice").only().parseResult(alice)).toEqual(alice);
		expect(() =>
			db.select("user", "alice").only().parseResult([alice]),
		).toThrow();

		expect(db.create("user", "alice").only().parseResult(alice)).toEqual(alice);
		expect(() =>
			db.create("user", "alice").only().parseResult([alice]),
		).toThrow();

		expect(db.select("user", "alice").parseResult([alice])).toEqual([alice]);
	});

	test("unsupported builders do not expose only()", () => {
		const unsupportedTypeAssertions = () => {
			// @ts-expect-error INSERT does not support ONLY.
			db.insert("user", { name: "Alice", age: 30 }).only();
			// @ts-expect-error LIVE SELECT does not support ONLY.
			db.live("user").only();
		};

		expect(typeof unsupportedTypeAssertions).toBe("function");
	});
});
