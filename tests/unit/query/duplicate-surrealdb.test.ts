import { describe, expect, test } from "bun:test";
import { Surreal, type SurrealSession } from "surrealdb";
import { DuplicateSurrealError, orm, t, table } from "../../../src";

const user = table("user", { name: t.string() });

/** The rejection the server gives for a subject the SDK encoded as `{}`. */
const emptySubject = (statement: string) =>
	new Error(`Cannot execute ${statement} statement using value: {  }`);

/**
 * A connection from "another copy" of the SDK: it is not an instance of the
 * `SurrealSession` Surqlize imports, so it behaves as a duplicate install does.
 */
function foreignSurreal(error: Error) {
	return {
		query: () => Promise.reject(error),
		transaction: () => Promise.reject(error),
		live: () => Promise.reject(error),
	} as unknown as SurrealSession;
}

describe("duplicate surrealdb installs", () => {
	test("a query names the duplicate install instead of the server error", async () => {
		const db = orm(foreignSurreal(emptySubject("CREATE")), user);
		const failure = db.select("user").execute();
		await expect(failure).rejects.toBeInstanceOf(DuplicateSurrealError);
		await expect(failure).rejects.toThrow(
			/more than one copy of the `surrealdb`/,
		);
		await expect(failure).rejects.toThrow(/npm ls surrealdb/);
	});

	test("the original error is kept as the cause", async () => {
		const original = emptySubject("CREATE");
		const db = orm(foreignSurreal(original), user);
		const error = await db
			.select("user")
			.execute()
			.catch((e) => e);
		expect(error).toBeInstanceOf(DuplicateSurrealError);
		expect(error.cause).toBe(original);
	});

	test("a batch is translated too", async () => {
		const db = orm(foreignSurreal(emptySubject("SELECT")), user);
		await expect(db.batch(db.select("user")).execute()).rejects.toBeInstanceOf(
			DuplicateSurrealError,
		);
	});

	test("a live query is translated too", async () => {
		const db = orm(foreignSurreal(emptySubject("LIVE")), user);
		await expect(db.live("user").execute()).rejects.toBeInstanceOf(
			DuplicateSurrealError,
		);
	});

	test("unrelated errors are left alone", async () => {
		const original = new Error("The table 'user' does not exist");
		const db = orm(foreignSurreal(original), user);
		await expect(db.select("user").execute()).rejects.toBe(original);
	});

	test("the empty-subject error from a genuine connection is left alone", async () => {
		const surreal = new Surreal();
		const original = emptySubject("CREATE");
		surreal.query = (() => Promise.reject(original)) as never;
		const db = orm(surreal, user);
		await expect(db.select("user").execute()).rejects.toBe(original);
	});
});
