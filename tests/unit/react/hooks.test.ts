import { afterEach, describe, expect, test } from "bun:test";
import { createElement, type ReactElement, StrictMode, useState } from "react";
import { renderToString } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { type LiveMessage, QueryStore, type StoreSnapshot } from "../../../src";
import {
	StoreProvider,
	usePending,
	useQuery,
	useStore,
} from "../../../src/react";

// The test renderer announces its own deprecation on every use.
const warn = console.error;
console.error = (...args: unknown[]) => {
	if (String(args[0]).includes("react-test-renderer is deprecated")) return;
	warn(...args);
};

// Tell React that updates in these tests happen inside act().
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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
		act(async () => {
			state.handler?.({ action, recordId: row.id, value: row } as never);
		});
	return { store, state, send };
}

const wait = (ms = 10) =>
	act(() => new Promise<void>((r) => setTimeout(r, ms)));

let renderer: ReactTestRenderer | undefined;
afterEach(() => {
	act(() => renderer?.unmount());
	renderer = undefined;
});

function mount(element: ReactElement) {
	act(() => {
		renderer = create(element);
	});
	return renderer as ReactTestRenderer;
}

/** A component that records every snapshot it renders. */
function probe<S>(use: () => S) {
	const seen: S[] = [];
	const Probe = () => {
		const value = use();
		seen.push(value);
		return null;
	};
	return { seen, Probe };
}

const last = <S>(seen: S[]): S => seen[seen.length - 1] as S;

describe("useQuery", () => {
	test("renders loading, then the result, then follows notifications", async () => {
		const { store, send } = fake();
		const { seen, Probe } = probe(() => useQuery(store));
		mount(createElement(Probe));
		expect(seen[0]?.status).toBe("loading");

		await wait();
		const snap = last(seen) as StoreSnapshot<Row>;
		expect(snap.status === "success" && snap.data).toEqual([{ id: "a", n: 1 }]);

		await send("UPDATE", { id: "a", n: 2 });
		await send("CREATE", { id: "b", n: 9 });
		const now = last(seen) as StoreSnapshot<Row>;
		expect(now.status === "success" && now.data.map((r) => r.n)).toEqual([
			2, 9,
		]);
	});

	test("does not render again when nothing changed", async () => {
		const { store } = fake();
		const { seen, Probe } = probe(() => useQuery(store));
		mount(createElement(Probe));
		await wait();
		const rendered = seen.length;
		await wait(40);
		expect(seen.length).toBe(rendered);
	});

	test("two components share one query and one live subscription", async () => {
		const { store, state } = fake();
		const one = probe(() => useQuery(store));
		const two = probe(() => useQuery(store));
		mount(
			createElement(
				"div",
				null,
				createElement(one.Probe),
				createElement(two.Probe),
			),
		);
		await wait();
		expect(state.fetches).toBe(1);
		expect(last(one.seen)).toBe(last(two.seen));
	});

	test("null skips the query, and a store given later starts it", async () => {
		const { store, state } = fake();
		let setUse: (on: boolean) => void = () => {};
		const { seen, Probe } = probe(() => {
			const [on, set] = useState(false);
			setUse = set;
			return useQuery(on ? store : null);
		});
		mount(createElement(Probe));
		await wait();
		expect(last(seen)).toEqual({ status: "skipped" });
		expect(state.fetches).toBe(0);

		await act(async () => setUse(true));
		await wait();
		expect(last(seen).status).toBe("success");
		expect(state.fetches).toBe(1);
	});

	test("stops the live subscription shortly after the last component unmounts", async () => {
		const { store, state } = fake();
		const { Probe } = probe(() => useQuery(store));
		const tree = mount(createElement(Probe));
		await wait();
		expect(state.stops).toBe(0);
		act(() => tree.unmount());
		await wait(80);
		expect(state.stops).toBe(1);
	});

	test("StrictMode's mount, unmount and mount does not restart the query", async () => {
		const { store, state } = fake();
		const { seen, Probe } = probe(() => useQuery(store));
		mount(createElement(StrictMode, null, createElement(Probe)));
		await wait(60);
		expect(state.fetches).toBe(1);
		expect(state.stops).toBe(0);
		expect(last(seen).status).toBe("success");
	});

	test("renders as loading on the server", () => {
		const { store } = fake();
		const Component = () => createElement("p", null, useQuery(store).status);
		expect(renderToString(createElement(Component))).toContain("loading");
	});

	test("a skipped query renders as skipped on the server", () => {
		const Component = () => createElement("p", null, useQuery(null).status);
		expect(renderToString(createElement(Component))).toContain("skipped");
	});
});

describe("usePending", () => {
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
		const { seen, Probe } = probe(() => usePending(store as never));
		mount(createElement(Probe));
		expect(last(seen)).toHaveLength(0);

		ops = [{ table: "task", id: "a", kind: "create" }];
		await act(async () => {
			for (const l of listeners) l();
		});
		expect(last(seen)).toHaveLength(1);
	});

	test("is empty without a store", () => {
		const { seen, Probe } = probe(() => usePending(null));
		mount(createElement(Probe));
		expect(last(seen)).toHaveLength(0);
	});
});

describe("StoreProvider and useStore", () => {
	test("gives the store to components below", () => {
		const store = { db: {} } as never;
		const { seen, Probe } = probe(() => useStore());
		mount(createElement(StoreProvider, { store }, createElement(Probe)));
		expect(last(seen)).toBe(store);
	});

	test("throws without a provider", () => {
		const { Probe } = probe(() => useStore());
		const quiet = console.error;
		console.error = () => {};
		try {
			expect(() => mount(createElement(Probe))).toThrow(/StoreProvider/);
		} finally {
			console.error = quiet;
		}
	});
});
