import { describe, expect, test } from "bun:test";
import type { SurrealSession } from "surrealdb";
import { orm, Transaction, t, table } from "../../../src";

type Recorded = {
	signals: Array<AbortSignal | undefined>;
	requestTimeouts: number[];
	retries: unknown[];
};

/**
 * A stand-in for the SDK's `Query`: configured through `.signal()`,
 * `.requestTimeout()` and `.retry()`, each of which returns it, and awaited for
 * the (empty) result of one statement.
 */
function mockSdkQuery(recorded: Recorded) {
	const query = {
		signal(signal: AbortSignal | undefined) {
			recorded.signals.push(signal);
			return query;
		},
		requestTimeout(milliseconds: number) {
			recorded.requestTimeouts.push(milliseconds);
			return query;
		},
		retry(options?: unknown) {
			recorded.retries.push(options);
			return query;
		},
		// biome-ignore lint/suspicious/noThenProperty: stands in for a thenable SDK query
		then(
			onFulfilled: (value: unknown[]) => unknown,
			onRejected?: (reason: unknown) => unknown,
		) {
			return Promise.resolve([[]]).then(onFulfilled, onRejected);
		},
	};
	return query;
}

function mockSurreal() {
	const recorded: Recorded = { signals: [], requestTimeouts: [], retries: [] };
	const surreal = {
		query: () => mockSdkQuery(recorded),
	} as unknown as SurrealSession;
	return { surreal, recorded };
}

describe("Query request options", () => {
	const user = table("user", { name: t.string() });

	test("forwards nothing when no option is set", async () => {
		const { surreal, recorded } = mockSurreal();
		const db = orm(surreal, user);

		await db.select("user");

		expect(recorded).toEqual({ signals: [], requestTimeouts: [], retries: [] });
	});

	test(".signal() is forwarded to the SDK query", async () => {
		const { surreal, recorded } = mockSurreal();
		const db = orm(surreal, user);
		const signal = new AbortController().signal;

		await db.select("user").signal(signal);

		expect(recorded.signals).toEqual([signal]);
	});

	test("signals combine, in the order they were added", async () => {
		const { surreal, recorded } = mockSurreal();
		const db = orm(surreal, user);
		const first = new AbortController().signal;
		const second = new AbortController().signal;

		await db.select("user").signal(first).signal(second);

		expect(recorded.signals).toEqual([first, second]);
	});

	test("a missing signal changes nothing", async () => {
		const { surreal, recorded } = mockSurreal();
		const db = orm(surreal, user);

		await db.select("user").signal(undefined);

		expect(recorded.signals).toEqual([]);
	});

	test(".requestTimeout() is forwarded, including 0 (no limit)", async () => {
		const { surreal, recorded } = mockSurreal();
		const db = orm(surreal, user);

		await db.select("user").requestTimeout(250);
		await db.select("user").requestTimeout(0);

		expect(recorded.requestTimeouts).toEqual([250, 0]);
	});

	test(".retry() defaults to enabled, and takes options or false", async () => {
		const { surreal, recorded } = mockSurreal();
		const db = orm(surreal, user);

		await db.select("user").retry();
		await db.select("user").retry({ attempts: 2 });
		await db.select("user").retry(false);

		expect(recorded.retries).toEqual([true, { attempts: 2 }, false]);
	});

	test("options apply to every kind of query and the .then accessors", async () => {
		const { surreal, recorded } = mockSurreal();
		const db = orm(surreal, user);

		await db.create("user").set({ name: "a" }).requestTimeout(1);
		await db.update("user").set({ name: "b" }).requestTimeout(2);
		await db.delete("user").requestTimeout(3);
		await db.select("user").requestTimeout(4).then.val();
		await db.select("user").requestTimeout(5).then.at(0);

		expect(recorded.requestTimeouts).toEqual([1, 2, 3, 4, 5]);
	});

	test("options are immutable: each call derives a new query", async () => {
		const { surreal, recorded } = mockSurreal();
		const db = orm(surreal, user);
		const signal = new AbortController().signal;

		const base = db.select("user");
		const configured = base.signal(signal).requestTimeout(99).retry();

		expect(configured).not.toBe(base);
		await base;
		expect(recorded).toEqual({ signals: [], requestTimeouts: [], retries: [] });

		await configured;
		expect(recorded.signals).toEqual([signal]);
		expect(recorded.requestTimeouts).toEqual([99]);
		expect(recorded.retries).toEqual([true]);
	});

	test("options do not change the rendered SurrealQL", () => {
		const { surreal } = mockSurreal();
		const db = orm(surreal, user);

		const base = db.select("user").where((u) => u.name.eq("a"));
		const configured = base
			.signal(new AbortController().signal)
			.requestTimeout(1)
			.retry();

		expect(configured.toString()).toBe(base.toString());
	});
});

describe("Orm.withSignal()", () => {
	const user = table("user", { name: t.string() });

	/** A session whose `withSignal()` returns a distinguishable scoped handle. */
	function scopedSurreal() {
		const queried: string[] = [];
		const scoped = {
			name: "scoped",
			query: () => {
				queried.push("scoped");
				return mockSdkQuery({ signals: [], requestTimeouts: [], retries: [] });
			},
		};
		const bound: Array<AbortSignal | undefined> = [];
		const surreal = {
			name: "session",
			query: () => {
				queried.push("session");
				return mockSdkQuery({ signals: [], requestTimeouts: [], retries: [] });
			},
			withSignal: (signal: AbortSignal | undefined) => {
				bound.push(signal);
				return scoped;
			},
		};
		return {
			surreal: surreal as unknown as SurrealSession,
			queried,
			bound,
			scoped,
		};
	}

	test("returns an ORM bound to the scoped handle, sharing the schema", async () => {
		const { surreal, queried, bound, scoped } = scopedSurreal();
		const db = orm(surreal, user);
		const signal = new AbortController().signal;

		const scopedDb = db.withSignal(signal);

		expect(bound).toEqual([signal]);
		expect(scopedDb).not.toBe(db);
		expect(scopedDb.surreal).toBe(scoped as never);
		expect(scopedDb.tables).toBe(db.tables);
		expect(scopedDb.lookup).toBe(db.lookup);

		await scopedDb.select("user");
		await db.select("user");
		expect(queried).toEqual(["scoped", "session"]);
	});

	test("leaves the original ORM untouched", () => {
		const { surreal } = scopedSurreal();
		const db = orm(surreal, user);

		db.withSignal(new AbortController().signal);

		expect(db.surreal).toBe(surreal);
	});

	test("on a Transaction, returns a Transaction on the same transaction", async () => {
		const events: string[] = [];
		const makeTransaction = (label: string) => {
			const txn = {
				query: () =>
					mockSdkQuery({ signals: [], requestTimeouts: [], retries: [] }),
				commit: () => {
					events.push(`commit:${label}`);
					return Promise.resolve();
				},
				cancel: () => {
					events.push(`cancel:${label}`);
					return Promise.resolve();
				},
				withSignal: () => makeTransaction(`${label}+signal`),
			};
			return txn;
		};
		const surreal = {
			beginTransaction: () => Promise.resolve(makeTransaction("tx")),
		} as unknown as SurrealSession;
		const db = orm(surreal, user);

		const tx = await db.transaction();
		const scoped = tx.withSignal(new AbortController().signal);

		expect(scoped).toBeInstanceOf(Transaction);
		expect(scoped).not.toBe(tx);
		await scoped.commit();
		await scoped.cancel();
		expect(events).toEqual(["commit:tx+signal", "cancel:tx+signal"]);
	});
});
