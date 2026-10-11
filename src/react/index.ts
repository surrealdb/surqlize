import {
	createContext,
	createElement,
	type ReactElement,
	type ReactNode,
	useContext,
	useSyncExternalStore,
} from "react";
// Types only: this entry must not pull a second copy of the store into a bundle.
import type { Orm } from "../schema/orm";
import type {
	OutboxOp,
	QueryStore,
	Store,
	StoreSnapshot,
} from "../store/index";

/**
 * What {@link useQuery} returns for a query that was skipped by passing
 * `null` or `undefined`.
 */
export type SkippedSnapshot = { readonly status: "skipped" };

const LOADING: StoreSnapshot<never> = Object.freeze({ status: "loading" });
const SKIPPED: SkippedSnapshot = Object.freeze({ status: "skipped" });
const NO_OPS: readonly OutboxOp[] = Object.freeze([]);

const noUnsubscribe = () => {};
const subscribeNothing = () => noUnsubscribe;
const getSkipped = () => SKIPPED;
const getLoading = () => LOADING;
const getNoOps = () => NO_OPS;

/**
 * Subscribe a component to a query of a {@link Store}. It re-renders when the
 * result changes, and the live subscription starts with the first component
 * that uses the query and stops shortly after the last one unmounts.
 *
 * ```tsx
 * const open = useQuery(store.query("task", (q) => q.where({ done: false })));
 *
 * if (open.status === "loading") return <Spinner />;
 * if (open.status === "error") return <Retry onClick={...} />;
 * return <List items={open.data} />;
 * ```
 *
 * `store.query()` returns the same object for the same query, so it can be
 * called in the render. Pass `null` or `undefined` to skip the query until its
 * inputs are known; the result is then `{ status: "skipped" }`.
 *
 * On the server, and during hydration, the result is `{ status: "loading" }`.
 */
export function useQuery<T>(query: QueryStore<T>): StoreSnapshot<T>;
export function useQuery<T>(
	query: QueryStore<T> | null | undefined,
): StoreSnapshot<T> | SkippedSnapshot;
export function useQuery<T>(
	query: QueryStore<T> | null | undefined,
): StoreSnapshot<T> | SkippedSnapshot {
	return useSyncExternalStore<StoreSnapshot<T> | SkippedSnapshot>(
		query ? query.subscribe : subscribeNothing,
		query ? query.getSnapshot : getSkipped,
		query ? getLoading : getSkipped,
	);
}

/**
 * The writes of a store that the database has not accepted yet, oldest first.
 * Use it to show that changes are unsaved, for example while offline.
 *
 * ```tsx
 * const pending = usePending(store);
 * return pending.length > 0 ? <span>Saving {pending.length} changes…</span> : null;
 * ```
 */
export function usePending(
	store: Pick<Store<Orm>, "pending"> | null | undefined,
): readonly OutboxOp[] {
	return useSyncExternalStore(
		store ? store.pending.subscribe : subscribeNothing,
		store ? store.pending.getSnapshot : getNoOps,
		getNoOps,
	);
}

// biome-ignore lint/suspicious/noExplicitAny: a store of any ORM; callers name the ORM in useStore
const StoreContext = createContext<Store<any> | undefined>(undefined);

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
	children?: ReactNode;
}): ReactElement {
	return createElement(
		StoreContext.Provider,
		{ value: props.store },
		props.children,
	);
}

/**
 * The store given to the nearest {@link StoreProvider}. Name the ORM to get its
 * tables typed: `useStore<typeof db>()`.
 *
 * @throws If there is no provider above the component.
 */
export function useStore<O extends Orm = Orm>(): Store<O> {
	const store = useContext(StoreContext);
	if (!store) {
		throw new Error("useStore() needs a <StoreProvider> above this component");
	}
	return store as Store<O>;
}
