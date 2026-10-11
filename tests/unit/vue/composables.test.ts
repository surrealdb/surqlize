import { describe, expect, test } from "bun:test";
import {
	createRenderer,
	createSSRApp,
	defineComponent,
	effectScope,
	h,
	nextTick,
	shallowRef,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { type LiveMessage, QueryStore } from "../../../src";
import { provideStore, usePending, useQuery, useStore } from "../../../src/vue";

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

/** A renderer that draws nothing, so components run their real lifecycle without a DOM. */
const { createApp } = createRenderer<object, object>({
	patchProp() {},
	insert() {},
	remove() {},
	createElement: () => ({}),
	createText: () => ({}),
	createComment: () => ({}),
	setText() {},
	setElementText() {},
	parentNode: () => null,
	nextSibling: () => null,
});

function mount(component: ReturnType<typeof defineComponent>) {
	const app = createApp(component);
	app.mount({});
	return app;
}

describe("useQuery", () => {
	test("holds loading, then the result, then follows notifications", async () => {
		const { store, send } = fake();
		const scope = effectScope();
		const snap = scope.run(() => useQuery(store));
		if (!snap) throw new Error("no ref");
		expect(snap.value.status).toBe("loading");

		await wait();
		expect(snap.value.status).toBe("success");

		send("UPDATE", { id: "a", n: 2 });
		send("CREATE", { id: "b", n: 9 });
		const value = snap.value;
		expect(value.status === "success" && value.data.map((r) => r.n)).toEqual([
			2, 9,
		]);
		scope.stop();
	});

	test("stops following when its scope stops, and the query stops shortly after", async () => {
		const { store, state, send } = fake();
		const scope = effectScope();
		const snap = scope.run(() => useQuery(store));
		if (!snap) throw new Error("no ref");
		await wait();
		scope.stop();
		const before = snap.value;
		send("CREATE", { id: "z", n: 1 });
		expect(snap.value).toBe(before);
		await wait(80);
		expect(state.stops).toBe(1);
	});

	test("a ref or getter changes the query, and null skips it", async () => {
		const one = fake();
		const two = fake();
		two.state.rows = [{ id: "x", n: 7 }];
		// A shallow ref: a deep ref would wrap the store in a reactive proxy.
		const which = shallowRef<QueryStore<Row> | null>(null);
		const scope = effectScope();
		const snap = scope.run(() => useQuery(which));
		expect(snap?.value).toEqual({ status: "skipped" });

		which.value = one.store;
		await wait();
		expect(snap?.value.status).toBe("success");

		which.value = two.store;
		await wait();
		const value = snap?.value;
		expect(value?.status === "success" && value.data).toEqual([
			{ id: "x", n: 7 },
		]);
		// The first query is no longer followed.
		await wait(80);
		expect(one.state.stops).toBe(1);

		which.value = null;
		expect(snap?.value).toEqual({ status: "skipped" });
		scope.stop();
	});

	test("two users of one query share one live subscription", async () => {
		const { store, state } = fake();
		const scope = effectScope();
		scope.run(() => {
			useQuery(store);
			useQuery(store);
		});
		await wait();
		expect(state.fetches).toBe(1);
		scope.stop();
	});

	test("in a component, it follows once mounted and stops when unmounted", async () => {
		const { store, state, send } = fake();
		let snap: ReturnType<typeof useQuery<Row>> | undefined;
		const Comp = defineComponent({
			setup() {
				snap = useQuery(store);
				return () => h("div");
			},
		});
		const app = mount(Comp);
		await wait();
		expect(snap?.value.status).toBe("success");
		send("CREATE", { id: "b", n: 2 });
		const value = snap?.value;
		expect(value?.status === "success" && value.data).toHaveLength(2);

		app.unmount();
		await wait(80);
		expect(state.stops).toBe(1);
	});

	test("on the server it renders loading and starts nothing", async () => {
		const { store, state } = fake();
		const Comp = defineComponent({
			setup() {
				const snap = useQuery(store);
				return () => h("p", snap.value.status);
			},
		});
		const html = await renderToString(createSSRApp(Comp));
		expect(html).toContain("loading");
		await wait(50);
		expect(state.fetches).toBe(0);
		expect(state.stops).toBe(0);
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
		const scope = effectScope();
		const pending = scope.run(() => usePending(store as never));
		expect(pending?.value).toHaveLength(0);

		ops = [{ table: "task", id: "a", kind: "create" }];
		for (const l of listeners) l();
		await nextTick();
		expect(pending?.value).toHaveLength(1);
		scope.stop();
		expect(listeners.size).toBe(0);
	});

	test("is empty without a store", () => {
		const scope = effectScope();
		expect(scope.run(() => usePending(null))?.value).toHaveLength(0);
		scope.stop();
	});
});

describe("provideStore and useStore", () => {
	test("gives the store to a component below", () => {
		const store = { db: {} } as never;
		let got: unknown;
		const Child = defineComponent({
			setup() {
				got = useStore();
				return () => h("i");
			},
		});
		const Parent = defineComponent({
			setup() {
				provideStore(store);
				return () => h(Child);
			},
		});
		mount(Parent);
		expect(got).toBe(store);
	});

	test("throws without a provider", () => {
		const Comp = defineComponent({
			setup() {
				useStore();
				return () => h("i");
			},
		});
		const app = createApp(Comp);
		let error: unknown;
		app.config.warnHandler = () => {};
		app.config.errorHandler = (e) => {
			error = e;
		};
		app.mount({});
		expect(String(error)).toContain("provideStore");
	});
});
