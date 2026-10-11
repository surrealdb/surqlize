import type { Orm } from "../schema/orm";
// Types only: this entry must not pull a second copy of the store into a bundle.
import type {
	OutboxOp,
	QueryStore,
	Store,
	StoreSnapshot,
} from "../store/index";

/**
 * What {@link queryStore} holds for a query that was skipped by passing `null`
 * or `undefined`.
 */
export type SkippedSnapshot = { readonly status: "skipped" };

/**
 * A Svelte store: anything with `subscribe`, which calls its callback at once
 * with the current value and again on each change. Use it with `$`, or with
 * `get()` and `derived()` from `svelte/store`.
 */
export type Readable<T> = {
	subscribe(run: (value: T) => void, invalidate?: () => void): () => void;
};

const SKIPPED: SkippedSnapshot = Object.freeze({ status: "skipped" });
const NO_OPS: readonly OutboxOp[] = Object.freeze([]);

/**
 * A Svelte store that follows a query of a {@link Store}. The live subscription
 * starts with the first subscriber and stops shortly after the last one leaves,
 * so a component that is destroyed and created again straight away does not
 * restart it.
 *
 * ```svelte
 * <script>
 *   import { queryStore } from "surqlize/svelte";
 *   const open = queryStore(store.query("task", (q) => q.where({ done: false })));
 * </script>
 *
 * {#if $open.status === "loading"}
 *   <p>Loading…</p>
 * {:else if $open.status === "success"}
 *   {#each $open.data as task (String(task.id))}<li>{task.title}</li>{/each}
 * {/if}
 * ```
 *
 * `store.query()` returns the same object for the same query, so it can be
 * called where the store is made. Pass `null` or `undefined` to skip the query;
 * the value is then `{ status: "skipped" }`.
 */
export function queryStore<T>(
	query: QueryStore<T> | null | undefined,
): Readable<StoreSnapshot<T> | SkippedSnapshot> {
	return {
		subscribe(run) {
			if (!query) {
				run(SKIPPED);
				return () => {};
			}
			run(query.getSnapshot());
			return query.subscribe(() => run(query.getSnapshot()));
		},
	};
}

/**
 * A Svelte store of the writes the database has not accepted yet, oldest first.
 * Use it to show that changes are unsaved, for example while offline.
 */
export function pendingStore(
	store: Pick<Store<Orm>, "pending"> | null | undefined,
): Readable<readonly OutboxOp[]> {
	return {
		subscribe(run) {
			if (!store) {
				run(NO_OPS);
				return () => {};
			}
			run(store.pending.getSnapshot());
			return store.pending.subscribe(() => run(store.pending.getSnapshot()));
		},
	};
}
