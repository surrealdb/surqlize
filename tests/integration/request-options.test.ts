import { describe, expect, test } from "bun:test";
import { orm, sleep, t, table } from "../../src";
import { withTestDb } from "./setup";

const userData = (first: string) => ({
	name: { first, last: "Test" },
	age: 30,
	email: `${first.toLowerCase()}@example.com`,
	created: new Date(),
	updated: new Date(),
});

// A row whose `delay` makes any query over it take that long.
const slow = table("slow", { delay: t.string() });

/** Resolves once `predicate` holds, or fails the test after `ms`. */
async function until(predicate: () => boolean, ms = 5_000) {
	const deadline = performance.now() + ms;
	while (!predicate()) {
		if (performance.now() > deadline) throw new Error("timed out waiting");
		await Bun.sleep(10);
	}
}

describe("Request options integration tests", () => {
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			await surreal.query(
				"DEFINE TABLE user SCHEMALESS; DEFINE TABLE post SCHEMALESS; CREATE slow:1 SET delay = 600ms;",
			);
		},
	});

	/** A query that takes as long as `slow:1.delay`, and selects nothing. */
	const slowQuery = (db: ReturnType<typeof withSlow>) =>
		db.select("slow").where((row) => sleep(row.delay));
	const withSlow = (surreal: Parameters<typeof orm>[0]) => orm(surreal, slow);

	describe("signal()", () => {
		test("a signal that has already aborted rejects with its reason, without sending", async () => {
			const { db } = getTestDb();
			const reason = new Error("already gone");

			await expect(
				db
					.create("user", "ghost")
					.set(userData("Ghost"))
					.signal(AbortSignal.abort(reason))
					.execute(),
			).rejects.toBe(reason);

			expect(await db.select("user")).toEqual([]);
		});

		test("a signal that aborts mid-flight stops the wait with its reason", async () => {
			const { surreal } = getTestDb();
			const db = withSlow(surreal);
			const controller = new AbortController();
			const reason = new Error("client went away");

			const pending = slowQuery(db).signal(controller.signal).execute();
			setTimeout(() => controller.abort(reason), 50);

			// Were the signal ignored, the query would resolve after its sleep
			// instead of rejecting with the reason.
			await expect(pending).rejects.toBe(reason);
		}, 15_000);

		test("AbortSignal.timeout() reaches the caller as a TimeoutError", async () => {
			const { surreal } = getTestDb();
			const db = withSlow(surreal);

			const error = await slowQuery(db)
				.signal(AbortSignal.timeout(50))
				.then(
					() => undefined,
					(e: unknown) => e,
				);

			expect((error as Error).name).toBe("TimeoutError");
		}, 15_000);

		test("a signal that never aborts changes nothing", async () => {
			const { db } = getTestDb();
			const controller = new AbortController();

			const [created] = await db
				.create("user", "fine")
				.set(userData("Fine"))
				.signal(controller.signal);

			expect(created?.name.first).toBe("Fine");
		});

		test("does not mutate the query it is called on", async () => {
			const { db } = getTestDb();
			const base = db.select("user");

			base.signal(AbortSignal.abort(new Error("only for the derived query")));

			await expect(base.execute()).resolves.toEqual([]);
		});
	});

	describe("requestTimeout()", () => {
		test("gives up with a TimeoutError when the server is too slow", async () => {
			const { surreal } = getTestDb();
			const db = withSlow(surreal);

			const error = await slowQuery(db)
				.requestTimeout(50)
				.then(
					() => undefined,
					(e: unknown) => e,
				);

			expect((error as Error).name).toBe("TimeoutError");
		}, 15_000);

		test("is the client's limit, distinct from the server-side TIMEOUT clause", () => {
			const { db } = getTestDb();

			const query = db.select("user").requestTimeout(50);

			expect(query.toString()).not.toContain("TIMEOUT");
			expect(db.select("user").timeout("5s").toString()).toContain("TIMEOUT");
		});

		test("a generous limit lets the query complete", async () => {
			const { surreal } = getTestDb();
			const db = withSlow(surreal);

			await expect(
				slowQuery(db).requestTimeout(5_000).execute(),
			).resolves.toEqual([]);
		}, 15_000);

		test("0 waits without limit", async () => {
			const { db } = getTestDb();

			await expect(
				db.select("user").requestTimeout(0).execute(),
			).resolves.toEqual([]);
		});
	});

	describe("retry()", () => {
		test("runs a query normally when there is no conflict", async () => {
			const { db } = getTestDb();

			const [created] = await db
				.create("user", "retry_ok")
				.set(userData("Retry"))
				.retry();

			expect(created?.name.first).toBe("Retry");
			expect(await db.select("user").retry()).toHaveLength(1);
		});

		test("does not retry an error that is not a conflict", async () => {
			const { db } = getTestDb();
			await db.create("user", "dup").set(userData("Dup"));

			// Re-sending would only fail again; it must surface, not loop.
			await expect(
				db.create("user", "dup").set(userData("Dup")).retry().execute(),
			).rejects.toThrow(/already exists/i);
		});
	});

	describe("withSignal()", () => {
		test("every query made through the scope is abandoned when the signal aborts", async () => {
			const { db } = getTestDb();
			const reason = new Error("request aborted");
			const scoped = db.withSignal(AbortSignal.abort(reason));

			await expect(scoped.select("user").execute()).rejects.toBe(reason);
			await expect(
				scoped.create("user", "scoped").set(userData("Scoped")).execute(),
			).rejects.toBe(reason);

			// The scope did not affect the ORM it was made from.
			expect(await db.select("user")).toEqual([]);
			await db.create("user", "after").set(userData("After"));
			expect(await db.select("user")).toHaveLength(1);
		});

		test("a scope whose signal has not aborted behaves like the ORM itself", async () => {
			const { db } = getTestDb();
			const scoped = db.withSignal(new AbortController().signal);

			await scoped.create("user", "ok").set(userData("Ok"));

			expect((await scoped.select("user")).map((u) => u.id.id)).toEqual(["ok"]);
			expect((await db.select("user")).map((u) => u.id.id)).toEqual(["ok"]);
		});

		test("aborting later abandons a query that is already waiting", async () => {
			const { surreal } = getTestDb();
			const controller = new AbortController();
			const scoped = withSlow(surreal).withSignal(controller.signal);
			const reason = new Error("late abort");

			const pending = slowQuery(scoped).execute();
			setTimeout(() => controller.abort(reason), 50);

			await expect(pending).rejects.toBe(reason);
		}, 15_000);

		test("a live subscription made through the scope is killed when the signal aborts", async () => {
			const { db } = getTestDb();
			const controller = new AbortController();

			const sub = await db.withSignal(controller.signal).live("user");
			expect(sub.isAlive).toBe(true);

			controller.abort();

			await until(() => !sub.isAlive);
			expect(sub.isAlive).toBe(false);
		}, 15_000);

		test("a live subscription on the plain ORM outlives the scope's signal", async () => {
			const { db } = getTestDb();
			const controller = new AbortController();
			db.withSignal(controller.signal);

			const sub = await db.live("user");
			controller.abort();
			await Bun.sleep(100);

			expect(sub.isAlive).toBe(true);
			await sub.kill();
		}, 15_000);

		test("transactions begun through the scope are bound to the signal", async () => {
			const { db } = getTestDb();
			const controller = new AbortController();
			const scoped = db.withSignal(controller.signal);

			await scoped.transaction(async (tx) => {
				await tx.create("user", "in_scope").set(userData("InScope"));
			});
			expect(await db.select("user")).toHaveLength(1);

			controller.abort(new Error("done"));
			await expect(scoped.transaction()).rejects.toThrow("done");
		}, 15_000);

		test("Transaction.withSignal() keeps the transaction's commit and cancel", async () => {
			const { db } = getTestDb();
			const tx = await db.transaction();
			const controller = new AbortController();
			const scoped = tx.withSignal(controller.signal);

			await scoped.create("user", "via_scope").set(userData("ViaScope"));
			// The scope is a handle on the same transaction: committing through it
			// applies the work done through either handle.
			await scoped.commit();

			expect((await db.select("user")).map((u) => u.id.id)).toEqual([
				"via_scope",
			]);
		}, 15_000);

		test("Transaction.withSignal() abandons queries but not the commit", async () => {
			const { db } = getTestDb();
			const tx = await db.transaction();
			const controller = new AbortController();
			const scoped = tx.withSignal(controller.signal);
			await scoped.create("user", "kept").set(userData("Kept"));

			controller.abort(new Error("request aborted"));
			// Queries are abandoned...
			await expect(scoped.select("user").execute()).rejects.toThrow(
				"request aborted",
			);
			// ...but the commit is a request of its own, so its outcome is never left
			// in doubt by an abandoned request.
			await scoped.commit();

			expect(await db.select("user")).toHaveLength(1);
		}, 15_000);
	});
});
