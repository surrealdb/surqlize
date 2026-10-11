import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { LiveMessage } from "../../../src";
import { QueryStore } from "../../../src";

// Under Bun, `solid-js` resolves to its server build, where effects never run.
// These tests need the browser build, and the code under test must get the same
// copy, so it is swapped in before that code is imported.
type Solid = typeof import("solid-js");
type Bindings = typeof import("../../../src/solid");
let solid: Solid;
let bindings: Bindings;

beforeAll(async () => {
	// The path has no declaration file, so it is imported by name at run time.
	const browser: Solid = await import("solid-js/dist/solid.js" as string);
	mock.module("solid-js", () => browser);
	solid = await import("solid-js");
	bindings = await import("../../../src/solid");
});

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

/** Run `body` in a root, and return what it made with a way to dispose it. */
function root<T>(body: () => T): { value: T; dispose: () => void } {
	let dispose = () => {};
	const value = solid.createRoot((d) => {
		dispose = d;
		return body();
	});
	return { value, dispose };
}

describe("createQuery", () => {
	test("holds loading, then the result, then follows notifications", async () => {
		const { store, send } = fake();
		const { value: snap, dispose } = root(() => bindings.createQuery(store));
		expect(snap().status).toBe("loading");

		await wait();
		expect(snap().status).toBe("success");

		send("UPDATE", { id: "a", n: 2 });
		send("CREATE", { id: "b", n: 9 });
		const now = snap();
		expect(now.status === "success" && now.data.map((r) => r.n)).toEqual([
			2, 9,
		]);
		dispose();
	});

	test("an effect that reads it runs on each change", async () => {
		const { store, send } = fake();
		const seen: string[] = [];
		const { dispose } = root(() => {
			const snap = bindings.createQuery(store);
			solid.createEffect(() => {
				const s = snap();
				seen.push(s.status === "success" ? String(s.data.length) : s.status);
			});
		});
		await wait();
		send("CREATE", { id: "b", n: 2 });
		expect(seen.at(0)).toBe("loading");
		expect(seen.at(-1)).toBe("2");
		dispose();
	});

	test("stops when its owner is disposed, and the query stops shortly after", async () => {
		const { store, state, send } = fake();
		const { value: snap, dispose } = root(() => bindings.createQuery(store));
		await wait();
		dispose();
		const before = snap();
		send("CREATE", { id: "z", n: 1 });
		expect(snap()).toBe(before);
		await wait(80);
		expect(state.stops).toBe(1);
	});

	test("an accessor changes the query, and null skips it", async () => {
		const one = fake();
		const two = fake();
		two.state.rows = [{ id: "x", n: 7 }];
		const [which, setWhich] = solid.createSignal<QueryStore<Row> | null>(null);
		const { value: snap, dispose } = root(() => bindings.createQuery(which));
		await wait();
		expect(snap()).toEqual({ status: "skipped" });

		setWhich(() => one.store);
		await wait();
		expect(snap().status).toBe("success");

		setWhich(() => two.store);
		await wait();
		const now = snap();
		expect(now.status === "success" && now.data).toEqual([{ id: "x", n: 7 }]);
		await wait(80);
		expect(one.state.stops).toBe(1);

		setWhich(() => null);
		await wait();
		expect(snap()).toEqual({ status: "skipped" });
		dispose();
	});

	test("two users of one query share one live subscription", async () => {
		const { store, state } = fake();
		const { dispose } = root(() => {
			bindings.createQuery(store);
			bindings.createQuery(store);
		});
		await wait();
		expect(state.fetches).toBe(1);
		dispose();
	});
});

describe("createPending", () => {
	test("follows the pending writes of a store", async () => {
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
		const { value: pending, dispose } = root(() =>
			bindings.createPending(store as never),
		);
		await wait();
		expect(pending()).toHaveLength(0);

		ops = [{ table: "task", id: "a", kind: "create" }];
		for (const l of listeners) l();
		expect(pending()).toHaveLength(1);
		dispose();
		expect(listeners.size).toBe(0);
	});

	test("is empty without a store", async () => {
		const { value: pending, dispose } = root(() =>
			bindings.createPending(null),
		);
		await wait();
		expect(pending()).toHaveLength(0);
		dispose();
	});
});

describe("StoreProvider and useStore", () => {
	test("gives the store to components below", () => {
		const store = { db: {} } as never;
		let got: unknown;
		const { dispose } = root(() =>
			bindings.StoreProvider({
				store,
				get children() {
					got = bindings.useStore();
					return undefined;
				},
			}),
		);
		expect(got).toBe(store);
		dispose();
	});

	test("throws without a provider", () => {
		const { dispose } = root(() => {
			expect(() => bindings.useStore()).toThrow(/StoreProvider/);
		});
		dispose();
	});
});
