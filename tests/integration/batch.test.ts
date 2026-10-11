import { describe, expect, test } from "bun:test";
import { AlreadyExistsError, RecordId } from "surrealdb";
import { orm, sleep, t, table } from "../../src";
import { atLeast, serverVersion } from "../helpers/db";
import { withTestDb } from "./setup";

// SurrealDB 3.1.0 started reporting a transaction conflict as a structured
// `TransactionConflict` error, which is what `.retry()` recognises by default.
// Earlier servers need a `retryable` predicate (see the SDK's `RetryOptions`).
const structuredConflicts = atLeast(await serverVersion(), 3, 1);
const conflictByMessage = {
	enabled: true,
	retryable: (error: unknown) =>
		error instanceof Error && /conflict|can be retried/i.test(error.message),
};

const userData = (first: string) => ({
	name: { first, last: "Test" },
	age: 30,
	email: `${first.toLowerCase()}@example.com`,
	created: new Date(),
	updated: new Date(),
});

// `slow` holds a row whose `delay` makes any query over it take that long, and
// `counter` a single record to contend over. Together they let a test hold a
// transaction open while something else commits.
const slow = table("slow", { delay: t.string() });
const counter = table("counter", { n: t.number() });

describe("Batch integration tests", () => {
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			await surreal.query(
				"DEFINE TABLE user SCHEMALESS; CREATE slow:1 SET delay = 400ms; CREATE counter:c SET n = 0;",
			);
		},
	});

	/** A query that takes as long as `slow:1.delay`, and selects nothing. */
	const slowQuery = (db: ReturnType<typeof contention>) =>
		db.select("slow").where((row) => sleep(row.delay));

	const contention = (surreal: Parameters<typeof orm>[0]) =>
		orm(surreal, slow, counter);

	/** The batch is held open sleeping while a competing write commits. */
	const conflictingBatch = (db: ReturnType<typeof contention>) =>
		db.batch(db.update("counter", "c").set({ n: { "+=": 1 } }), slowQuery(db));

	const counterValue = async (db: ReturnType<typeof contention>) =>
		(await db.select("counter").then.val())?.n;

	test("applies every statement and resolves to a typed tuple", async () => {
		const { db } = getTestDb();

		const [created, selected, deleted] = await db.batch(
			db.create("user", "batch_a").set(userData("Ada")),
			db.select("user"),
			db.delete("user", "batch_a"),
		);

		expect(created[0]?.name.first).toBe("Ada");
		// Each statement sees the ones before it, within the one transaction.
		expect(selected.map((u) => u.name.first)).toEqual(["Ada"]);
		// DELETE returns nothing unless asked to.
		expect(deleted).toEqual([]);
		expect(await db.select("user")).toEqual([]);
	});

	test("is atomic: a failing statement rolls back the ones before it", async () => {
		const { db } = getTestDb();
		await db.create("user", "taken").set(userData("Taken"));

		await expect(
			db
				.batch(
					db.create("user", "fresh").set(userData("Fresh")),
					// Fails: this id already exists.
					db.create("user", "taken").set(userData("Dup")),
				)
				.execute(),
		).rejects.toBeInstanceOf(AlreadyExistsError);

		const ids = (await db.select("user")).map((u) => u.id.id);
		expect(ids).toEqual(["taken"]);
	});

	test("rejects with the error that failed the batch, not a 'not executed' one", async () => {
		const { db } = getTestDb();
		await db.create("user", "taken").set(userData("Taken"));

		// The failing statement is first, so the statements after it are reported
		// by the server as skipped. The cause is what must surface.
		const error = await db
			.batch(db.create("user", "taken").set(userData("Dup")), db.select("user"))
			.then(
				() => undefined,
				(e: unknown) => e,
			);

		expect(error).toBeInstanceOf(AlreadyExistsError);
		expect(String((error as Error).message)).not.toMatch(/not executed/i);
	});

	test("accepts statements with a RETURN clause", async () => {
		const { db } = getTestDb();

		const [created, updated] = await db.batch(
			db.create("user", "ret").set(userData("Ret")).return("none"),
			db.update("user", "ret").set({ age: 31 }).return("none"),
		);

		expect(created).toEqual([]);
		expect(updated).toEqual([]);
		expect((await db.select("user").then.val())?.age).toBe(31);
	});

	test("an empty batch resolves to [], and still honours an aborted signal", async () => {
		const { db } = getTestDb();
		const reason = new Error("gone");

		expect(await db.batch()).toEqual([]);
		await expect(
			db.withSignal(AbortSignal.abort(reason)).batch().execute(),
		).rejects.toBe(reason);
		await expect(
			db.batch().signal(AbortSignal.abort(reason)).execute(),
		).rejects.toBe(reason);
	});

	describe("request options", () => {
		test("a transaction conflict fails the batch and applies nothing", async () => {
			const { surreal } = getTestDb();
			const db = contention(surreal);

			const batch = conflictingBatch(db).then(
				() => undefined,
				(e: unknown) => e,
			);
			await Bun.sleep(120);
			// Commits while the batch is still sleeping inside its transaction.
			await db.update("counter", "c").set({ n: { "+=": 100 } });

			const error = await batch;

			expect(String((error as Error).message)).toMatch(/conflict/i);
			// Only the competing write took effect: the batch rolled back whole.
			expect(await counterValue(db)).toBe(100);
		}, 15_000);

		test.skipIf(!structuredConflicts)(
			".retry() re-sends the batch after a conflict, applying it exactly once",
			async () => {
				const { surreal } = getTestDb();
				const db = contention(surreal);

				const batch = conflictingBatch(db).retry().execute();
				await Bun.sleep(120);
				await db.update("counter", "c").set({ n: { "+=": 100 } });

				await batch;

				expect(await counterValue(db)).toBe(101);
			},
			15_000,
		);

		test(".retry() takes a predicate to recognise conflicts on any server version", async () => {
			const { surreal } = getTestDb();
			const db = contention(surreal);

			const batch = conflictingBatch(db).retry(conflictByMessage).execute();
			await Bun.sleep(120);
			await db.update("counter", "c").set({ n: { "+=": 100 } });

			await batch;

			expect(await counterValue(db)).toBe(101);
		}, 15_000);

		test(".signal() abandons a batch that was aborted before it was sent", async () => {
			const { db } = getTestDb();
			const reason = new Error("abandoned");

			await expect(
				db
					.batch(db.create("user", "never").set(userData("Never")))
					.signal(AbortSignal.abort(reason))
					.execute(),
			).rejects.toBe(reason);

			expect(await db.select("user")).toEqual([]);
		});

		test(".signal() abandons a batch that is waiting on the server", async () => {
			const { surreal } = getTestDb();
			const db = contention(surreal);
			const controller = new AbortController();
			const reason = new Error("client went away");

			const batch = conflictingBatch(db).signal(controller.signal).execute();
			setTimeout(() => controller.abort(reason), 50);

			// Were the signal ignored, the batch would resolve after its 400ms
			// sleep instead of rejecting with the reason.
			await expect(batch).rejects.toBe(reason);
		}, 15_000);

		test(".requestTimeout() gives up with a TimeoutError", async () => {
			const { surreal } = getTestDb();
			const db = contention(surreal);

			const error = await conflictingBatch(db)
				.requestTimeout(50)
				.then(
					() => undefined,
					(e: unknown) => e,
				);

			expect((error as Error).name).toBe("TimeoutError");
		}, 15_000);

		test("options derive a new batch and leave the original unchanged", async () => {
			const { db } = getTestDb();

			const base = db.batch(db.create("user", "base").set(userData("Base")));
			const abandoned = base.signal(AbortSignal.abort(new Error("no")));

			await expect(abandoned.execute()).rejects.toThrow("no");
			// The original was never given the signal.
			await expect(base.execute()).resolves.toHaveLength(1);
			expect(base).not.toBe(abandoned);
		});
	});

	test("withSignal() binds a batch to the request's signal", async () => {
		const { db } = getTestDb();
		const reason = new Error("request aborted");

		await expect(
			db
				.withSignal(AbortSignal.abort(reason))
				.batch(db.create("user", "scoped").set(userData("Scoped")))
				.execute(),
		).rejects.toBe(reason);

		expect(await db.select("user")).toEqual([]);
	});

	test("batch() is rejected inside an interactive transaction", async () => {
		const { db } = getTestDb();

		const tx = await db.transaction();
		try {
			expect(() =>
				tx.batch(tx.create("user", "nested").set(userData("Nested"))),
			).toThrow(/cannot be used inside a transaction/);
		} finally {
			await tx.cancel();
		}

		expect(await db.select(new RecordId("user", "nested"))).toEqual([]);
	});
});
