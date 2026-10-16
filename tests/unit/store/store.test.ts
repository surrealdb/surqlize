import { describe, expect, test } from "bun:test";
import {
	DateTime,
	Decimal,
	QueryError,
	RecordId,
	ServerError,
	Surreal,
	Uuid,
} from "surrealdb";
import {
	createStore,
	memoryStorage,
	orm,
	type StoreOptions,
	t,
	table,
} from "../../../src";
import type { ConnectionEvents } from "../../../src/store";
import { encode } from "../../../src/store/codec";

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
 * and writes that fail as `failure` says, by default as a dropped connection does.
 */
function fakeDb(
	failure: (attempt: number) => Error | undefined = () =>
		new Error("socket closed"),
) {
	const state = { liveOpened: 0, liveClosed: 0, reads: 0, writes: 0 };
	const write = () => {
		const chain = {
			content: () => chain,
			merge: () => chain,
			execute: async () => {
				const error = failure(++state.writes);
				if (error) throw error;
				return [{ id: "x" }];
			},
		};
		return chain;
	};
	const db = {
		select: (tb: string) => ({
			prepare: () => ({ query: `SELECT * FROM ${tb}`, bindings: {} }),
			execute: async () => {
				state.reads++;
				return [];
			},
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

const conflict = () =>
	new QueryError({
		kind: "Query",
		message: "Transaction conflict: Write conflict, retry the transaction",
		details: { kind: "TransactionConflict" },
	});

describe("Store write failures", () => {
	const write = (db: never) =>
		createStore(db, { retry: { minMs: 5, maxMs: 5 } })
			.table("doc" as never)
			.update("x", {} as never) as { committed: Promise<unknown> };

	test("a retryable conflict is not a refusal: the write is sent again", async () => {
		const { db, state } = fakeDb((attempt) =>
			attempt < 3 ? conflict() : undefined,
		);
		await expect(write(db).committed).resolves.toEqual({ id: "x" });
		expect(state.writes).toBe(3);
	});

	test("any other refusal from the database still drops the write", async () => {
		for (const error of [
			new ServerError({ kind: "Thrown", message: "refused" }),
			new QueryError({
				kind: "Query",
				message: "x",
				details: { kind: "NotExecuted" },
			}),
			new QueryError({ kind: "Query", message: "Transaction conflict: retry" }),
		]) {
			const { db, state } = fakeDb(() => error);
			await expect(write(db).committed).rejects.toBe(error);
			expect(state.writes).toBe(1);
		}
	});
});

/** A gate that the test opens, or fails, when it chooses, and that counts its calls. */
function controlledGate() {
	const gate = {
		calls: 0,
		open: () => {},
		fail: (_error: Error) => {},
		fn: () => {
			gate.calls++;
			return new Promise<void>((resolve, reject) => {
				gate.open = resolve;
				gate.fail = reject;
			});
		},
	};
	return gate;
}

/** Counts how a promise ends. */
function settle() {
	const state = {
		calls: 0,
		resolve: () => {
			state.calls++;
		},
		reject: () => {
			state.calls++;
		},
	};
	return state;
}

/** A store over the fake ORM, typed loosely: the tests do not care about rows. */
type LooseStore = {
	query(tb: string): {
		subscribe(listener: () => void): () => void;
		getSnapshot(): {
			status: string;
			error?: unknown;
			data?: readonly unknown[];
		};
		refetch(): Promise<void>;
	};
	table(tb: string): {
		create(data: object): { committed: Promise<unknown> };
	};
	pending: { getSnapshot(): readonly unknown[] };
	ready: Promise<void>;
	dispose(): void;
};
const loose = (db: never, options: StoreOptions = {}) =>
	createStore(db, options) as unknown as LooseStore;

describe("Store gate", () => {
	const subscribe = (store: LooseStore, tb = "doc") =>
		store.query(tb).subscribe(() => {});
	const create = (store: LooseStore, tb = "doc") =>
		store.table(tb).create({}).committed;

	test("is not called by making a store, asking for a query or a writer", async () => {
		const { db } = fakeDb();
		const gate = controlledGate();
		const store = loose(db, { gate: gate.fn });
		store.query("doc");
		store.table("doc");
		await store.ready;
		await tick();
		expect(gate.calls).toBe(0);
	});

	test("holds live registration and the first read until it resolves", async () => {
		const { db, state } = fakeDb();
		const gate = controlledGate();
		const store = loose(db, { gate: gate.fn, idleMs: 1000 });
		const all = store.query("doc");
		all.subscribe(() => {});
		await tick();
		expect(gate.calls).toBe(1);
		expect(state.liveOpened).toBe(0);
		expect(state.reads).toBe(0);
		expect(all.getSnapshot().status).toBe("loading");

		gate.open();
		await tick();
		expect(state.liveOpened).toBe(1);
		expect(state.reads).toBe(1);
		expect(all.getSnapshot().status).toBe("success");
	});

	test("one call serves every query, and an open gate is not called again", async () => {
		const { db } = fakeDb(() => undefined);
		const gate = controlledGate();
		const store = loose(db, { gate: gate.fn, idleMs: 1000 });
		subscribe(store, "a");
		subscribe(store, "b");
		await tick();
		expect(gate.calls).toBe(1);
		gate.open();
		await tick();
		subscribe(store, "c");
		await create(store, "a");
		expect(gate.calls).toBe(1);
	});

	test("holds a write, shows it, and sends it once it resolves", async () => {
		const { db, state } = fakeDb(() => undefined);
		const gate = controlledGate();
		const store = loose(db, { gate: gate.fn });
		const committed = create(store);
		await tick();
		expect(gate.calls).toBe(1);
		expect(store.pending.getSnapshot()).toHaveLength(1);
		expect(state.writes).toBe(0);

		gate.open();
		await expect(committed).resolves.toEqual({ id: "x" });
		expect(state.writes).toBe(1);
		expect(store.pending.getSnapshot()).toHaveLength(0);
	});

	test("holds a write loaded from storage, which is sent once it resolves", async () => {
		const { db, state } = fakeDb(() => undefined);
		const storage = memoryStorage();
		await storage.put(
			1,
			encode({ table: "doc", id: "left", kind: "create", data: {} }),
		);
		const gate = controlledGate();
		const store = loose(db, { gate: gate.fn, storage, idleMs: 1000 });
		await store.ready;
		await tick();
		expect(state.writes).toBe(0);
		expect(store.pending.getSnapshot()).toHaveLength(1);

		// The next thing that needs the connection asks for it.
		subscribe(store);
		await tick();
		gate.open();
		await tick();
		expect(state.writes).toBe(1);
		expect(store.pending.getSnapshot()).toHaveLength(0);
		expect(await storage.load()).toHaveLength(0);
	});

	test("a store disposed while it waits sends nothing when it resolves, and keeps the write for the next store", async () => {
		const { db, state } = fakeDb(() => undefined);
		const storage = memoryStorage();
		const gate = controlledGate();
		const store = loose(db, { gate: gate.fn, storage });
		void create(store);
		await tick();
		expect(gate.calls).toBe(1);

		store.dispose();
		gate.open();
		await tick();
		expect(state.writes).toBe(0);
		expect(await storage.load()).toHaveLength(1);
	});

	test("a rejected gate fails a query but never a write, and is called again by the next need", async () => {
		const { db, state } = fakeDb(() => undefined);
		const gate = controlledGate();
		const store = loose(db, { gate: gate.fn, idleMs: 1000 });
		const all = store.query("doc");
		all.subscribe(() => {});
		const ended = settle();
		create(store).then(ended.resolve, ended.reject);
		await tick();
		expect(gate.calls).toBe(1);

		gate.fail(new Error("no session"));
		await tick();
		expect(all.getSnapshot()).toMatchObject({
			status: "error",
			error: new Error("no session"),
		});
		// The write is neither sent nor dropped, and not rejected for it.
		expect(state.writes).toBe(0);
		expect(ended.calls).toBe(0);
		expect(store.pending.getSnapshot()).toHaveLength(1);
		// And the store does not call the gate again on its own.
		await tick(30);
		expect(gate.calls).toBe(1);

		// A read asks again.
		const read = all.refetch();
		await tick();
		expect(gate.calls).toBe(2);
		gate.open();
		await read;
		await tick();
		expect(all.getSnapshot().status).toBe("success");
		expect(state.writes).toBe(1);
		expect(ended.calls).toBe(1);
		expect(store.pending.getSnapshot()).toHaveLength(0);
	});

	/** A subscribed query that the gate has refused to start. */
	async function refused() {
		const { db, state } = fakeDb(() => undefined);
		const gate = controlledGate();
		const store = loose(db, { gate: gate.fn, idleMs: 1000 });
		const all = store.query("doc");
		all.subscribe(() => {});
		await tick();
		gate.fail(new Error("no session"));
		await tick();
		expect(all.getSnapshot().status).toBe("error");
		expect(state.liveOpened).toBe(0);
		return { store, all, gate, state };
	}

	test("a query the gate refused to start is started over by refetch(): live, and showing local writes", async () => {
		const { store, all, gate, state } = await refused();

		const read = all.refetch();
		await tick();
		gate.open();
		await read;
		expect(all.getSnapshot().status).toBe("success");
		expect(state.liveOpened).toBe(1);

		// It listens to the pending writes again: this one shows before it is sent.
		void create(store);
		expect(all.getSnapshot().data).toHaveLength(1);
		await tick();
		expect(all.getSnapshot().data).toHaveLength(1);
		expect(state.writes).toBe(1);
		expect(state.liveOpened).toBe(1);
	});

	test("a query the gate refused to start is started over by a new subscriber", async () => {
		const { all, gate, state } = await refused();

		all.subscribe(() => {});
		await tick();
		expect(gate.calls).toBe(2);
		gate.open();
		await tick();
		expect(all.getSnapshot().status).toBe("success");
		expect(state.liveOpened).toBe(1);
	});

	test("refetch() does not start a query again that was disposed", async () => {
		const { db, state } = fakeDb(() => undefined);
		const store = loose(db, { idleMs: 1000 });
		const all = store.query("doc");
		all.subscribe(() => {});
		await tick();
		expect(state.liveOpened).toBe(1);

		store.dispose();
		await all.refetch();
		await tick();
		expect(state.liveOpened).toBe(1);
		expect(state.liveClosed).toBe(1);
	});

	test("a gate that throws, rather than rejects, is called again by the next need", async () => {
		const { db, state } = fakeDb(() => undefined);
		let calls = 0;
		const store = loose(db, {
			gate: () => {
				if (++calls === 1) throw new Error("no session");
				return Promise.resolve();
			},
		});
		const all = store.query("doc");
		all.subscribe(() => {});
		await tick();
		expect(all.getSnapshot().status).toBe("error");

		await create(store);
		expect(calls).toBe(2);
		expect(state.writes).toBe(1);
	});

	test("without a gate nothing waits", async () => {
		const { db, state } = fakeDb(() => undefined);
		const store = loose(db, { idleMs: 1000 });
		subscribe(store);
		await tick(0);
		expect(state.liveOpened).toBe(1);
		await create(store);
		expect(state.writes).toBe(1);
	});
});
