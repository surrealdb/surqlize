import {
	type Accessor,
	createContext,
	createEffect,
	createSignal,
	type JSX,
	onCleanup,
	useContext,
} from "solid-js";
// Types only: this entry must not pull a second copy of the store into a bundle.
import type {
	OutboxOp,
	QueryStore,
	Store,
	StoreOrm,
	StoreSnapshot,
} from "../store/index";

/**
 * What {@link createQuery} returns for a query that was skipped by passing
 * `null` or `undefined`.
 */
export type SkippedSnapshot = { readonly status: "skipped" };

const LOADING: StoreSnapshot<never> = Object.freeze({ status: "loading" });
const SKIPPED: SkippedSnapshot = Object.freeze({ status: "skipped" });
const NO_OPS: readonly OutboxOp[] = Object.freeze([]);

type Source<S> = S | null | undefined | Accessor<S | null | undefined>;

const read = <S extends object>(source: Source<S>): S | null | undefined =>
	typeof source === "function"
		? (source as Accessor<S | null | undefined>)()
		: source;

/**
 * Follow `source` for as long as the calling owner lives, setting the signal
 * each time `attach` reports a change. Solid does not run effects when
 * rendering on the server, so nothing is subscribed there.
 */
function follow<S extends object, V>(
	source: Source<S>,
	initial: V,
	skipped: V,
	attach: (value: S, set: (next: V) => void) => () => void,
): Accessor<V> {
	const [value, setValue] = createSignal<V>(initial);
	createEffect(() => {
		const current = read(source);
		if (current === null || current === undefined) {
			setValue(() => skipped);
			return;
		}
		onCleanup(attach(current, (next) => setValue(() => next)));
	});
	return value;
}

/**
 * Follow a query of a {@link Store}. The returned accessor holds the snapshot
 * and updates whenever the result changes; the live subscription starts with
 * the first component that uses the query and stops shortly after the last one
 * is disposed.
 *
 * ```tsx
 * const open = createQuery(store.query("task", (q) => q.where({ done: false })));
 *
 * return (
 *   <Switch>
 *     <Match when={open().status === "loading"}>Loading…</Match>
 *     <Match when={open().status === "success"}>
 *       <For each={(open() as { data: Task[] }).data}>{(t) => <li>{t.title}</li>}</For>
 *     </Match>
 *   </Switch>
 * );
 * ```
 *
 * `store.query()` returns the same object for the same query, so it can be
 * called in the component body. Pass an accessor to change the query over time,
 * and `null` or `undefined` to skip it: the value is then `{ status: "skipped" }`.
 *
 * On the server the value stays `{ status: "loading" }`; the query runs in the
 * browser.
 */
export function createQuery<T>(
	query: Source<QueryStore<T>>,
): Accessor<StoreSnapshot<T> | SkippedSnapshot> {
	return follow<QueryStore<T>, StoreSnapshot<T> | SkippedSnapshot>(
		query,
		LOADING,
		SKIPPED,
		(q, set) => {
			set(q.getSnapshot());
			return q.subscribe(() => set(q.getSnapshot()));
		},
	);
}

/**
 * The writes of a store that the database has not accepted yet, oldest first.
 * Use it to show that changes are unsaved, for example while offline.
 */
export function createPending(
	store: Source<Pick<Store<StoreOrm>, "pending">>,
): Accessor<readonly OutboxOp[]> {
	return follow<Pick<Store<StoreOrm>, "pending">, readonly OutboxOp[]>(
		store,
		NO_OPS,
		NO_OPS,
		(s, set) => {
			set(s.pending.getSnapshot());
			return s.pending.subscribe(() => set(s.pending.getSnapshot()));
		},
	);
}

// biome-ignore lint/suspicious/noExplicitAny: a store of any ORM; callers name the ORM in useStore
const StoreContext = createContext<Store<any>>();

/**
 * Make a store available to the components below, for {@link useStore}.
 *
 * ```tsx
 * <StoreProvider store={store}>
 *   <App />
 * </StoreProvider>
 * ```
 */
export function StoreProvider(props: {
	// biome-ignore lint/suspicious/noExplicitAny: a store of any ORM
	store: Store<any>;
	children?: JSX.Element;
}): JSX.Element {
	return StoreContext.Provider({
		value: props.store,
		get children() {
			return props.children;
		},
	});
}

/**
 * The store given to the nearest {@link StoreProvider}. Name the ORM to get its
 * tables typed: `useStore<typeof db>()`.
 *
 * @throws If there is no provider above the component.
 */
export function useStore<O extends StoreOrm = StoreOrm>(): Store<O> {
	const store = useContext(StoreContext);
	if (!store) {
		throw new Error("useStore() needs a <StoreProvider> above this component");
	}
	return store as Store<O>;
}
