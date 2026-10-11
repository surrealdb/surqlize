import { describe, expect, test } from "bun:test";
import { seedTestData } from "../helpers/db";
import { withTestDb } from "./setup";

describe("Object-based where / orderBy integration", () => {
	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await seedTestData(surreal);
		},
	});

	const emails = (rows: { email: string }[]) => rows.map((r) => r.email);

	test("shorthand equality", async () => {
		const { db } = getTestDb();
		const rows = await db
			.select("user")
			.where({ email: "bob@example.com" })
			.execute();
		expect(emails(rows)).toEqual(["bob@example.com"]);
	});

	test("operators", async () => {
		const { db } = getTestDb();
		const rows = await db
			.select("user")
			.where({ age: { gt: 25, lt: 35 } })
			.execute();
		expect(emails(rows)).toEqual(["alice@example.com"]);

		const inside = await db
			.select("user")
			.where({ age: { inside: [25, 35] } })
			.orderBy({ age: "asc" })
			.execute();
		expect(emails(inside)).toEqual(["bob@example.com", "charlie@example.com"]);

		const starts = await db
			.select("user")
			.where({ email: { startsWith: "ali" } })
			.execute();
		expect(emails(starts)).toEqual(["alice@example.com"]);
	});

	test("nested object fields", async () => {
		const { db } = getTestDb();
		const rows = await db
			.select("user")
			.where({ name: { last: "Jones" } })
			.execute();
		expect(emails(rows)).toEqual(["bob@example.com"]);
	});

	test("record links", async () => {
		const { db } = getTestDb();
		const posts = await db
			.select("post")
			.where({ author: { age: { gte: 30 } } })
			.execute();
		expect(posts.map((p) => p.title)).toEqual(["First Post"]);
	});

	test("or / and / not combinators", async () => {
		const { db } = getTestDb();
		const either = await db
			.select("user")
			.where({ or: [{ age: { lt: 30 } }, { age: { gt: 30 } }] })
			.orderBy({ age: "asc" })
			.execute();
		expect(emails(either)).toEqual(["bob@example.com", "charlie@example.com"]);

		const not = await db
			.select("user")
			.where({ not: { age: { gte: 30 } } })
			.execute();
		expect(emails(not)).toEqual(["bob@example.com"]);

		const both = await db
			.select("user")
			.where({
				and: [{ age: { gte: 30 } }, { name: { first: "Charlie" } }],
			})
			.execute();
		expect(emails(both)).toEqual(["charlie@example.com"]);
	});

	test("undefined values are ignored, an empty filter matches all", async () => {
		const { db } = getTestDb();
		const rows = await db
			.select("user")
			.where({ email: undefined, age: { gt: undefined } })
			.execute();
		expect(rows).toHaveLength(3);
	});

	test("matches the fluent form", async () => {
		const { db } = getTestDb();
		const viaObject = await db
			.select("user")
			.where({ age: { gte: 25 }, name: { first: { ne: "Bob" } } })
			.orderBy({ age: "desc" })
			.execute();
		const viaFluent = await db
			.select("user")
			.where((u) => u.age.gte(25).and(u.name.first.ne("Bob")))
			.orderBy("age", "DESC")
			.execute();
		expect(viaObject).toEqual(viaFluent);
	});

	test("orderBy object", async () => {
		const { db } = getTestDb();
		const asc = await db.select("user").orderBy({ age: "asc" }).execute();
		expect(asc.map((u) => u.age)).toEqual([25, 30, 35]);
		const desc = await db.select("user").orderBy({ age: "DESC" }).execute();
		expect(desc.map((u) => u.age)).toEqual([35, 30, 25]);
	});

	test("orderBy nested fields and record links", async () => {
		const { db } = getTestDb();
		const users = await db
			.select("user")
			.orderBy({ name: { last: "asc" } })
			.execute();
		expect(users.map((u) => u.name.last)).toEqual(["Brown", "Jones", "Smith"]);

		const posts = await db
			.select("post")
			.orderBy({ author: { age: "desc" } })
			.execute();
		expect(posts.map((p) => p.title)).toEqual(["First Post", "Second Post"]);
	});

	test("orderBy object chains with fluent ordering and limit", async () => {
		const { db } = getTestDb();
		const rows = await db
			.select("user")
			.orderBy({ age: "desc" })
			.orderBy("email", "ASC")
			.limit(2)
			.execute();
		expect(rows.map((u) => u.age)).toEqual([35, 30]);
	});

	test("update and delete accept object filters", async () => {
		const { db } = getTestDb();
		await db
			.update("user")
			.set({ age: 26 })
			.where({ email: "bob@example.com" })
			.execute();
		const bob = await db
			.select("user")
			.where({ email: "bob@example.com" })
			.execute();
		expect(bob[0]?.age).toBe(26);

		await db
			.delete("user")
			.where({ name: { first: "Charlie" } })
			.execute();
		const left = await db.select("user").execute();
		expect(emails(left).sort()).toEqual([
			"alice@example.com",
			"bob@example.com",
		]);
	});
});
