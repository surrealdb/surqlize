import { describe, expect, test } from "bun:test";
import { RecordId, type SurrealSession } from "surrealdb";
import { orm, t, table } from "../../../src";

const user = table("user", {
	name: t.string(),
	age: t.number(),
});

const alice = { id: new RecordId("user", "alice"), name: "alice", age: 30 };
const bob = { id: new RecordId("user", "bob"), name: "bob", age: 25 };
const carol = { id: new RecordId("user", "carol"), name: "carol", age: 40 };
const rows = [alice, bob, carol];

/** Build an ORM whose SurrealDB session returns `result` for every query. */
function mockDb(result: unknown[]) {
	const surreal = {
		query: async () => [result],
	} as unknown as SurrealSession;
	return orm(surreal, user);
}

describe("Query.then result accessors", () => {
	test("then.val() resolves to the first record", async () => {
		const db = mockDb(rows);
		expect(await db.select("user").then.val()).toEqual(alice);
	});

	test("then.val() resolves to undefined for empty results", async () => {
		const db = mockDb([]);
		expect(await db.select("user").then.val()).toBeUndefined();
	});

	test("then.at(index) resolves to the record at that index", async () => {
		const db = mockDb(rows);
		expect(await db.select("user").then.at(0)).toEqual(alice);
		expect(await db.select("user").then.at(1)).toEqual(bob);
	});

	test("then.at supports negative indexing", async () => {
		const db = mockDb(rows);
		expect(await db.select("user").then.at(-1)).toEqual(carol);
	});

	test("then.at out of range resolves to undefined", async () => {
		const db = mockDb(rows);
		expect(await db.select("user").then.at(99)).toBeUndefined();
	});

	test("query still resolves to the full array when awaited directly", async () => {
		const db = mockDb(rows);
		const all = await db.select("user");
		expect(all).toHaveLength(3);
		expect(all).toEqual(rows);
	});

	// Regression for https://github.com/surrealdb/surqlize/issues/21:
	// .then.val()/.then.at() used to return an Actionable query-expression
	// (carrying helpers like eq/contains) instead of executing the query and
	// resolving to a record.
	test("then.val() returns a Promise, not an Actionable expression", async () => {
		const db = mockDb(rows);
		const result = db.select("user").then.val();
		expect(result).toBeInstanceOf(Promise);
		await result;
	});

	test("resolved record carries no query-expression helpers", async () => {
		const db = mockDb(rows);
		const first = (await db.select("user").then.val()) as Record<
			string,
			unknown
		>;
		expect(typeof first.eq).not.toBe("function");
		expect(typeof first.contains).not.toBe("function");
		expect(typeof first.val).not.toBe("function");
	});
});
