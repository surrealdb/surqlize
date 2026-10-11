import { describe, expect, test } from "bun:test";
import type { LiveMessage } from "../../../src";
import {
	type ConnectionSignal,
	QueryStore,
	type QueryStoreDeps,
} from "../../../src";

type Row = { id: string; n: number };

/** A table that tests drive by hand: its rows, its live handler, its connection. */
function fake(options: Partial<QueryStoreDeps<Row>> = {}) {
	const state = {
		rows: [] as Row[],
		handler: undefined as ((m: LiveMessage<Row>) => void) | undefined,
		connection: undefined as ((s: ConnectionSignal) => void) | undefined,
		fetches: 0,
		stops: 0,
		disposed: 0,
		gate: undefined as Promise<void> | undefined,
		failNext: false,
	};
	const deps: QueryStoreDeps<Row> = {
		mode: "direct",
		idleMs: 5,
		debounceMs: 1,
		keyOf: (row) => row.id,
		keyOfId: (id) => String(id),
		fetch: async () => {
			state.fetches++;
			const snapshot = state.rows.map((r) => ({ ...r }));
			await state.gate;
			if (state.failNext) {
				state.failNext = false;
				throw new Error("boom");
			}
			return snapshot;
		},
		live: async (handler) => {
			state.handler = handler;
			return () => {
				state.stops++;
			};
		},
		onConnection: (listener) => {
			state.connection = listener;
			return () => {
				state.connection = undefined;
			};
		},
		onDispose: () => {
			state.disposed++;
		},
		...options,
	};
	const store = new QueryStore<Row>(deps);
	const send = (action: "CREATE" | "UPDATE" | "DELETE", row: Row) =>
		state.handler?.({ action, recordId: row.id, value: row } as never);
	return { store, state, send };
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const data = (store: QueryStore<Row>) => {
	const snap = store.getSnapshot();
	if (snap.status !== "success") throw new Error(`status is ${snap.status}`);
	return snap.data;
};

describe("QueryStore", () => {
	test("starts loading, loads on first subscribe, and does nothing before", async () => {
		const { store, state } = fake();
		state.rows = [{ id: "a", n: 1 }];
		expect(store.getSnapshot().status).toBe("loading");
		await tick();
		expect(state.fetches).toBe(0);

		store.subscribe(() => {});
		await tick();
		expect(data(store)).toEqual([{ id: "a", n: 1 }]);
	});

	test("getSnapshot returns the same object until something changes", async () => {
		const { store, state, send } = fake();
		state.rows = [{ id: "a", n: 1 }];
		store.subscribe(() => {});
		await tick();
		const first = store.getSnapshot();
		expect(store.getSnapshot()).toBe(first);
		send("UPDATE", { id: "a", n: 2 });
		expect(store.getSnapshot()).not.toBe(first);
		expect(data(store)).toEqual([{ id: "a", n: 2 }]);
	});

	test("applies create, update and delete notifications", async () => {
		const { store, send } = fake();
		store.subscribe(() => {});
		await tick();
		send("CREATE", { id: "a", n: 1 });
		send("CREATE", { id: "b", n: 2 });
		send("UPDATE", { id: "a", n: 3 });
		send("DELETE", { id: "b", n: 2 });
		expect(data(store)).toEqual([{ id: "a", n: 3 }]);
	});

	test("a change made while the first query runs is not lost", async () => {
		let release: () => void = () => {};
		const { store, state, send } = fake();
		state.gate = new Promise<void>((r) => {
			release = r;
		});
		state.rows = [
			{ id: "a", n: 1 },
			{ id: "b", n: 1 },
		];
		store.subscribe(() => {});
		await tick();
		// The snapshot was taken before these, so it holds the old values.
		send("UPDATE", { id: "a", n: 2 });
		send("DELETE", { id: "b", n: 1 });
		send("CREATE", { id: "c", n: 9 });
		release();
		await tick();
		expect(data(store)).toEqual([
			{ id: "a", n: 2 },
			{ id: "c", n: 9 },
		]);
	});

	test("sorts a direct result when asked", async () => {
		const { store, state } = fake({ sort: (a, b) => b.n - a.n });
		state.rows = [
			{ id: "a", n: 1 },
			{ id: "b", n: 3 },
			{ id: "c", n: 2 },
		];
		store.subscribe(() => {});
		await tick();
		expect(data(store).map((r) => r.id)).toEqual(["b", "c", "a"]);
	});

	test("notifies subscribers on each change", async () => {
		const { store, send } = fake();
		let calls = 0;
		store.subscribe(() => calls++);
		await tick();
		const before = calls;
		send("CREATE", { id: "a", n: 1 });
		send("CREATE", { id: "b", n: 1 });
		expect(calls - before).toBe(2);
	});

	test("a KILLED notification is an error", async () => {
		const { store, state } = fake();
		store.subscribe(() => {});
		await tick();
		state.handler?.({ action: "KILLED" });
		expect(store.getSnapshot().status).toBe("error");
	});

	test("a failed first load is an error, and refetch recovers", async () => {
		const { store, state } = fake();
		state.failNext = true;
		state.rows = [{ id: "a", n: 1 }];
		store.subscribe(() => {});
		await tick();
		expect(store.getSnapshot().status).toBe("error");
		await store.refetch();
		expect(data(store)).toEqual([{ id: "a", n: 1 }]);
	});

	describe("connection", () => {
		test("is stale while disconnected and reads again on return", async () => {
			const { store, state, send } = fake();
			state.rows = [{ id: "a", n: 1 }];
			store.subscribe(() => {});
			await tick();

			state.connection?.("disconnected");
			const stale = store.getSnapshot();
			expect(stale.status === "success" && stale.stale).toBe(true);
			expect(data(store)).toEqual([{ id: "a", n: 1 }]);

			// A change made while disconnected was never delivered.
			state.rows = [{ id: "a", n: 5 }];
			state.connection?.("connected");
			await tick();
			const fresh = store.getSnapshot();
			expect(fresh.status === "success" && fresh.stale).toBe(false);
			expect(data(store)).toEqual([{ id: "a", n: 5 }]);

			send("UPDATE", { id: "a", n: 6 });
			expect(data(store)).toEqual([{ id: "a", n: 6 }]);
		});

		test("a connection event while connected changes nothing", async () => {
			const { store, state } = fake();
			store.subscribe(() => {});
			await tick();
			const fetches = state.fetches;
			state.connection?.("connected");
			await tick();
			expect(state.fetches).toBe(fetches);
		});

		test("a failed refresh keeps the data and stays stale", async () => {
			const { store, state } = fake();
			state.rows = [{ id: "a", n: 1 }];
			store.subscribe(() => {});
			await tick();
			state.connection?.("disconnected");
			state.failNext = true;
			state.connection?.("connected");
			await tick();
			const snap = store.getSnapshot();
			expect(snap.status).toBe("success");
			expect(snap.status === "success" && snap.stale).toBe(true);
			expect(data(store)).toEqual([{ id: "a", n: 1 }]);
		});
	});

	describe("lifecycle", () => {
		test("stays running while any subscriber remains, and stops after the idle time", async () => {
			const { store, state } = fake();
			const a = store.subscribe(() => {});
			const b = store.subscribe(() => {});
			await tick();
			expect(state.fetches).toBe(1);
			a();
			await tick(20);
			expect(state.stops).toBe(0);
			b();
			await tick(20);
			expect(state.stops).toBe(1);
			expect(state.disposed).toBe(1);
			expect(store.getSnapshot().status).toBe("loading");
		});

		test("unsubscribing and subscribing again at once does not restart it", async () => {
			const { store, state } = fake();
			const off = store.subscribe(() => {});
			await tick();
			off();
			store.subscribe(() => {});
			await tick(20);
			expect(state.stops).toBe(0);
			expect(state.fetches).toBe(1);
			expect(store.getSnapshot().status).toBe("success");
		});

		test("subscribes again after it has stopped", async () => {
			const { store, state } = fake();
			store.subscribe(() => {})();
			await tick(20);
			state.rows = [{ id: "z", n: 1 }];
			store.subscribe(() => {});
			await tick();
			expect(data(store)).toEqual([{ id: "z", n: 1 }]);
		});

		test("an unsubscribe before the live query is registered does not leak it", async () => {
			let resolveLive: (stop: () => void) => void = () => {};
			let stopped = 0;
			const { store } = fake({
				live: () =>
					new Promise((resolve) => {
						resolveLive = resolve;
					}),
			});
			store.subscribe(() => {})();
			await tick(20);
			resolveLive(() => {
				stopped++;
			});
			await tick();
			expect(stopped).toBe(1);
		});
	});

	describe("refetch mode", () => {
		test("reads the query again, once, for a burst of notifications", async () => {
			const { store, state, send } = fake({ mode: "refetch" });
			state.rows = [{ id: "a", n: 1 }];
			store.subscribe(() => {});
			await tick();
			expect(state.fetches).toBe(1);

			state.rows = [{ id: "a", n: 2 }];
			send("UPDATE", { id: "a", n: 2 });
			send("UPDATE", { id: "a", n: 2 });
			send("UPDATE", { id: "a", n: 2 });
			await tick(20);
			expect(state.fetches).toBe(2);
			expect(data(store)).toEqual([{ id: "a", n: 2 }]);
		});

		test("a record that stops matching disappears, though no notification says so", async () => {
			const { store, state, send } = fake({ mode: "refetch" });
			state.rows = [
				{ id: "a", n: 1 },
				{ id: "b", n: 1 },
			];
			store.subscribe(() => {});
			await tick();
			// The query filters on n = 1; `a` changes to n = 2 and leaves the result.
			state.rows = [{ id: "b", n: 1 }];
			send("UPDATE", { id: "a", n: 2 });
			await tick(20);
			expect(data(store)).toEqual([{ id: "b", n: 1 }]);
		});

		test("a notification during a read triggers another read", async () => {
			let release: () => void = () => {};
			const { store, state, send } = fake({ mode: "refetch" });
			state.rows = [{ id: "a", n: 1 }];
			store.subscribe(() => {});
			await tick();

			state.gate = new Promise<void>((r) => {
				release = r;
			});
			state.rows = [{ id: "a", n: 2 }];
			send("UPDATE", { id: "a", n: 2 });
			await tick(10);
			// The read is waiting on the gate; this change happens after it started.
			state.rows = [{ id: "a", n: 3 }];
			send("UPDATE", { id: "a", n: 3 });
			state.gate = undefined;
			release();
			await tick(30);
			expect(data(store)).toEqual([{ id: "a", n: 3 }]);
		});
	});
});
