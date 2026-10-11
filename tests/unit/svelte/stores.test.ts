import { describe, expect, test } from "bun:test";
import { derived, get } from "svelte/store";
import { type LiveMessage, QueryStore, type StoreSnapshot } from "../../../src";
import { pendingStore, queryStore } from "../../../src/svelte";

type Row = { id: string; n: number };

/** A table that tests drive by hand. */
function fake() {
	const state = {
		rows: [{ id: "a", n: 1 }] as Row[],
		handler: undefined as ((m: LiveMessage<Row>) => void) | undefined,
		stops: 0,
		fetches: 0,
	};
	const store = new QueryStore<Row>({
		mode: "direct",
		idleMs: 30,
		debounceMs: 1,
		keyOf: (r) => r.id,
		keyOfId: (id) => String(id),
		fetch: async () => {
			state.fetches++;
			return state.rows.map((r) => ({ ...r }));
		},
		live: async (handler) => {
			state.handler = handler;
			return () => {
				state.stops++;
			};
		},
	});
	const send = (action: "CREATE" | "UPDATE" | "DELETE", row: Row) =>
		state.handler?.({ action, recordId: row.id, value: row } as never);
	return { store, state, send };
}

const wait = (ms = 10) => new Promise<void>((r) => setTimeout(r, ms));
const data = (value: unknown) => {
	const snap = value as StoreSnapshot<Row>;
	if (snap.status !== "success") throw new Error(`status is ${snap.status}`);
	return snap.data;
};

describe("queryStore", () => {
	test("calls back at once with the current value, then with each change", async () => {
		const { store, send } = fake();
		const seen: string[] = [];
		const off = queryStore(store).subscribe((v) => seen.push(v.status));
		expect(seen).toEqual(["loading"]);

		await wait();
		expect(seen.at(-1)).toBe("success");

		const before = seen.length;
		send("CREATE", { id: "b", n: 2 });
		expect(seen.length).toBe(before + 1);
		off();
	});

	test("get() reads the value once the query has loaded", async () => {
		const { store } = fake();
		const readable = queryStore(store);
		const off = readable.subscribe(() => {});
		await wait();
		expect(data(get(readable))).toEqual([{ id: "a", n: 1 }]);
		off();
	});

	test("works with derived stores", async () => {
		const { store, send } = fake();
		const count = derived(queryStore(store), (v) =>
			v.status === "success" ? v.data.length : -1,
		);
		const seen: number[] = [];
		const off = count.subscribe((n) => seen.push(n));
		await wait();
		send("CREATE", { id: "b", n: 2 });
		expect(seen.at(-1)).toBe(2);
		off();
	});

	test("two subscribers share one query and one live subscription", async () => {
		const { store, state } = fake();
		const readable = queryStore(store);
		const a = readable.subscribe(() => {});
		const b = readable.subscribe(() => {});
		await wait();
		expect(state.fetches).toBe(1);
		a();
		b();
	});

	test("null skips the query", () => {
		const seen: unknown[] = [];
		const off = queryStore(null).subscribe((v) => seen.push(v));
		expect(seen).toEqual([{ status: "skipped" }]);
		off();
		expect(get(queryStore(undefined))).toEqual({ status: "skipped" });
	});

	test("stops the live subscription shortly after the last subscriber leaves", async () => {
		const { store, state } = fake();
		const off = queryStore(store).subscribe(() => {});
		await wait();
		expect(state.stops).toBe(0);
		off();
		await wait(80);
		expect(state.stops).toBe(1);
	});

	test("unsubscribing and subscribing again at once does not restart it", async () => {
		const { store, state } = fake();
		const readable = queryStore(store);
		readable.subscribe(() => {})();
		const again = readable.subscribe(() => {});
		await wait(80);
		expect(state.stops).toBe(0);
		expect(state.fetches).toBe(1);
		again();
	});
});

describe("pendingStore", () => {
	test("follows the pending writes of a store", () => {
		let ops: readonly { table: string; id: unknown; kind: "create" }[] = [];
		const listeners = new Set<() => void>();
		const store = {
			pending: {
				subscribe: (l: () => void) => {
					listeners.add(l);
					return () => listeners.delete(l);
				},
				getSnapshot: () => ops,
			},
		};
		const seen: number[] = [];
		const off = pendingStore(store as never).subscribe((v) =>
			seen.push(v.length),
		);
		expect(seen).toEqual([0]);

		ops = [{ table: "task", id: "a", kind: "create" }];
		for (const l of listeners) l();
		expect(seen).toEqual([0, 1]);
		off();
		expect(listeners.size).toBe(0);
	});

	test("is empty without a store", () => {
		expect(get(pendingStore(null))).toHaveLength(0);
	});
});
