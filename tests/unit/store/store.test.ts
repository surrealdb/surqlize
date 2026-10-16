import { describe, expect, test } from "bun:test";
import { DateTime, Decimal, RecordId, Surreal, Uuid } from "surrealdb";
import { createStore, orm, t, table } from "../../../src";
import type { ConnectionEvents } from "../../../src/store";

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

const doc = table("doc", {
	tags: t.set(t.string()),
	any: t.any(),
	raw: t.bytes(),
});

/** A store over an ORM that is not connected: asking for a query only renders it. */
function render() {
	const db = orm(new Surreal(), doc);
	const store = createStore(db);
	return {
		store,
		any: (value: unknown) =>
			store.query("doc", (q) => q.where({ any: { eq: value as never } })),
	};
}

describe("Store query keys", () => {
	test("queries that bind different sets are different stores", () => {
		const { store } = render();
		const a = store.query("doc", (q) => q.where({ tags: new Set(["a"]) }));
		const b = store.query("doc", (q) => q.where({ tags: new Set(["b"]) }));
		expect(a).not.toBe(b);
		expect(a).toBe(
			store.query("doc", (q) => q.where({ tags: new Set(["a"]) })),
		);
	});

	test("a set, an array and a map are told apart from each other and from an object", () => {
		const { any } = render();
		const stores = [
			any(new Set(["a"])),
			any(["a"]),
			any(new Map([["a", 1]])),
			any({ a: 1 }),
			any(new Set([1])),
			any(new Set(["1"])),
		];
		expect(new Set(stores).size).toBe(stores.length);
	});

	test("a set inside an array or an object is told apart", () => {
		const { any } = render();
		expect(any([new Set(["a"])])).not.toBe(any([new Set(["b"])]));
		expect(any({ x: new Set(["a"]) })).not.toBe(any({ x: new Set(["b"]) }));
		expect(any({ x: new Set(["a"]) })).toBe(any({ x: new Set(["a"]) }));
	});

	test("bytes and array buffers are told apart by content", () => {
		const { any } = render();
		const bytes = (...n: number[]) => new Uint8Array(n);
		expect(any(bytes(1, 2))).toBe(any(bytes(1, 2)));
		expect(any(bytes(1, 2))).not.toBe(any(bytes(1, 3)));
		expect(any(bytes(1, 2).buffer)).toBe(any(bytes(1, 2).buffer));
		expect(any(bytes(1, 2).buffer)).not.toBe(any(bytes(1, 3).buffer));
		// The same bytes in another container are another kind of value.
		expect(any(bytes(1, 2))).not.toBe(any(bytes(1, 2).buffer));
		expect(any(bytes(1, 2))).not.toBe(any([1, 2]));
	});

	test("SDK values are told apart from the text and number they print as", () => {
		const { any } = render();
		const iso = "2026-01-02T03:04:05.000Z";
		const uuid = "018f2c80-5b77-7a52-8f1a-4a3c8c1c5d11";
		expect(any(new Date(iso))).toBe(any(new Date(iso)));
		expect(any(new Date(iso))).not.toBe(any(iso));
		expect(any(new RecordId("a", "b"))).toBe(any(new RecordId("a", "b")));
		expect(any(new RecordId("a", "b"))).not.toBe(any("a:b"));
		expect(any(new RecordId("a", "b"))).not.toBe(any(new RecordId("a", "c")));
		expect(any(new Uuid(uuid))).not.toBe(any(uuid));
		expect(any(new Decimal("1.5"))).not.toBe(any(new Decimal("1.6")));
		expect(any(new Decimal("1.5"))).not.toBe(any(1.5));
		expect(any(new DateTime("2026-01-01T00:00:00.000000001Z"))).not.toBe(
			any(new DateTime("2026-01-01T00:00:00.000000002Z")),
		);
	});

	test("kinds of class are told apart, and a value that cannot be rendered does not throw", () => {
		const { any } = render();
		class A {}
		class B {}
		expect(any(new A())).not.toBe(any(new B()));

		// A bigint made `JSON.stringify` throw. It is another value than the number.
		expect(any(5n)).toBe(any(5n));
		expect(any(5n)).not.toBe(any(5));
		expect(any(5n)).not.toBe(any("5"));

		const loop: Record<string, unknown> = { a: 1 };
		loop.self = loop;
		expect(() => any(loop)).not.toThrow();
		expect(() => any(Symbol("s"))).not.toThrow();
		expect(() => any(() => 1)).not.toThrow();
		expect(() => any(Object.create(null))).not.toThrow();
		expect(any(Symbol("a"))).not.toBe(any(Symbol("b")));
	});
});

/** A connection that counts what is subscribed to it and what has left. */
function countingConnection() {
	const state = { subscribed: 0, left: 0 };
	const connection: ConnectionEvents = {
		subscribe() {
			state.subscribed++;
			return () => {
				state.left++;
			};
		},
	};
	return { connection, state };
}

/**
 * An ORM that answers from memory: no rows, a live query that can be counted,
 * and writes that fail as a dropped connection does.
 */
function fakeDb() {
	const state = { liveOpened: 0, liveClosed: 0, writes: 0 };
	const write = () => {
		const chain = {
			content: () => chain,
			merge: () => chain,
			execute: async () => {
				state.writes++;
				throw new Error("socket closed");
			},
		};
		return chain;
	};
	const db = {
		select: (tb: string) => ({
			prepare: () => ({ query: `SELECT * FROM ${tb}`, bindings: {} }),
			execute: async () => [],
		}),
		live: () => ({
			subscribe: async () => {
				state.liveOpened++;
				return () => {
					state.liveClosed++;
				};
			},
		}),
		upsert: write,
		update: write,
		delete: write,
	};
	return { db: db as never, state };
}

describe("Store.dispose", () => {
	test("leaves the connection it was listening to", () => {
		const { connection, state } = countingConnection();
		const { db } = fakeDb();
		const store = createStore(db, { connection });
		expect(state.subscribed).toBeGreaterThan(0);
		expect(state.left).toBe(0);
		store.dispose();
		expect(state.left).toBe(state.subscribed);
	});

	test("leaves the connection after the queries that listened to it, too", async () => {
		const { connection, state } = countingConnection();
		const { db } = fakeDb();
		const store = createStore(db, { connection, idleMs: 1000 });
		store.query("doc").subscribe(() => {});
		await tick();
		store.dispose();
		expect(state.left).toBe(state.subscribed);
	});

	test("stops the queries that are running, even while subscribed", async () => {
		const { db, state } = fakeDb();
		const store = createStore(db, { idleMs: 1000 });
		const all = store.query("doc");
		all.subscribe(() => {});
		await tick();
		expect(all.getSnapshot().status).toBe("success");
		expect(state.liveOpened).toBe(1);
		expect(state.liveClosed).toBe(0);

		store.dispose();
		expect(state.liveClosed).toBe(1);
		// The stopped query is forgotten: asking again makes a new one.
		expect(store.query("doc")).not.toBe(all);
	});

	test("a query that was about to go idle does not stop again later", async () => {
		const { db } = fakeDb();
		const store = createStore(db, { idleMs: 30 });
		store.query("doc").subscribe(() => {})();
		store.dispose();
		const again = store.query("doc");
		await tick(60);
		// The idle timer of the first query would remove its key, and this one with it.
		expect(store.query("doc")).toBe(again);
	});

	test("a disposed query that stops later leaves the query that replaced it alone", async () => {
		const { db } = fakeDb();
		const store = createStore(db, { idleMs: 20 });
		const old = store.query("doc");
		store.dispose();
		const fresh = store.query("doc");
		expect(fresh).not.toBe(old);

		// Someone still holds the old query: when its last subscriber leaves, it
		// stops, and that must not forget the key that now belongs to `fresh`.
		old.subscribe(() => {})();
		await tick(60);
		expect(store.query("doc")).toBe(fresh);
	});

	test("stops retrying a write that cannot be sent", async () => {
		const { db, state } = fakeDb();
		const store = createStore(db, { retry: { minMs: 5, maxMs: 5 } });
		void store
			.table("doc" as never)
			.create({} as never)
			.committed.catch(() => {});
		await tick(40);
		expect(state.writes).toBeGreaterThan(1);

		store.dispose();
		const writes = state.writes;
		await tick(40);
		expect(state.writes).toBe(writes);
		// The write is not lost: it is still pending.
		expect(store.pending.getSnapshot()).toHaveLength(1);
	});
});
