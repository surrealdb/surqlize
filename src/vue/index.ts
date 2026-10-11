import {
	getCurrentInstance,
	type InjectionKey,
	inject,
	type MaybeRefOrGetter,
	onMounted,
	provide,
	type ShallowRef,
	shallowRef,
	toValue,
	watch,
} from "vue";
import type { Orm } from "../schema/orm";
// Types only: this entry must not pull a second copy of the store into a bundle.
import type {
	OutboxOp,
	QueryStore,
	Store,
	StoreSnapshot,
} from "../store/index";

/**
 * What {@link useQuery} holds for a query that was skipped by passing `null` or
 * `undefined`.
 */
export type SkippedSnapshot = { readonly status: "skipped" };

const LOADING: StoreSnapshot<never> = Object.freeze({ status: "loading" });
const SKIPPED: SkippedSnapshot = Object.freeze({ status: "skipped" });
const NO_OPS: readonly OutboxOp[] = Object.freeze([]);

/**
 * Follow `source` for as long as the calling component or effect scope lives.
 *
 * Inside a component, nothing is subscribed until it has mounted. A component
 * is also set up when it is rendered on the server, where it never mounts and
 * is never torn down, so a subscription made then would be a live query that is
 * never stopped.
 */
function follow<S, V>(
	source: () => S | null | undefined,
	initial: V,
	skipped: V,
	attach: (value: S, set: (next: V) => void) => () => void,
): Readonly<ShallowRef<V>> {
	const state = shallowRef<V>(initial);
	const active = shallowRef(getCurrentInstance() === null);
	if (getCurrentInstance()) onMounted(() => (active.value = true));

	watch(
		[source, active],
		([value, on], _old, onCleanup) => {
			if (!on) return;
			if (value === null || value === undefined) {
				state.value = skipped;
				return;
			}
			onCleanup(attach(value, (next) => (state.value = next)));
		},
		{ immediate: true, flush: "sync" },
	);
	// The watcher stops with its scope, which also runs the cleanup it was given.
	return state;
}

/**
 * Follow a query of a {@link Store} in a component. The returned ref holds the
 * snapshot and updates whenever the result changes; the live subscription starts
 * with the first component that uses the query and stops shortly after the last
 * one is unmounted.
 *
 * ```vue
 * <script setup>
 * import { useQuery } from "surqlize/vue";
 * const open = useQuery(store.query("task", (q) => q.where({ done: false })));
 * </script>
 *
 * <template>
 *   <p v-if="open.status === 'loading'">Loading…</p>
 *   <ul v-else-if="open.status === 'success'">
 *     <li v-for="task in open.data" :key="String(task.id)">{{ task.title }}</li>
 *   </ul>
 * </template>
 * ```
 *
 * `store.query()` returns the same object for the same query, so it can be
 * called while setting up. Pass a ref or a getter to change the query over
 * time, and `null` or `undefined` to skip it: the value is then
 * `{ status: "skipped" }`.
 *
 * On the server the value stays `{ status: "loading" }`; the query runs in the
 * browser.
 */
export function useQuery<T>(
	query: MaybeRefOrGetter<QueryStore<T> | null | undefined>,
): Readonly<ShallowRef<StoreSnapshot<T> | SkippedSnapshot>> {
	return follow<QueryStore<T>, StoreSnapshot<T> | SkippedSnapshot>(
		() => toValue(query),
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
export function usePending(
	store: MaybeRefOrGetter<Pick<Store<Orm>, "pending"> | null | undefined>,
): Readonly<ShallowRef<readonly OutboxOp[]>> {
	return follow<Pick<Store<Orm>, "pending">, readonly OutboxOp[]>(
		() => toValue(store),
		NO_OPS,
		NO_OPS,
		(s, set) => {
			set(s.pending.getSnapshot());
			return s.pending.subscribe(() => set(s.pending.getSnapshot()));
		},
	);
}

// biome-ignore lint/suspicious/noExplicitAny: a store of any ORM; callers name the ORM in useStore
const STORE_KEY: InjectionKey<Store<any>> = Symbol("surqlize.store");

/**
 * Make a store available to the components below the one that calls this, for
 * {@link useStore}. Call it in `setup`, or on an app with `app.provide`.
 */
// biome-ignore lint/suspicious/noExplicitAny: a store of any ORM
export function provideStore(store: Store<any>): void {
	provide(STORE_KEY, store);
}

/**
 * The store given by {@link provideStore}. Name the ORM to get its tables
 * typed: `useStore<typeof db>()`.
 *
 * @throws If no component above this one provided a store.
 */
export function useStore<O extends Orm = Orm>(): Store<O> {
	const store = inject(STORE_KEY, undefined);
	if (!store) {
		throw new Error("useStore() needs provideStore() in a component above it");
	}
	return store as Store<O>;
}

export { STORE_KEY as storeKey };
