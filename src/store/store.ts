import type { RecordId } from "surrealdb";
import type { LiveMessage } from "../query/live";
import type { SelectQuery } from "../query/select";
import type { Orm } from "../schema/orm";
import type { WorkableContext } from "../utils";
import {
	type ConnectionSignal,
	QueryStore,
	type StoreSnapshot,
} from "./query-store";

export type StoreOptions = {
	/**
	 * Where connection events come from. Defaults to the connection of the ORM
	 * when it is a `Surreal` instance. Without one, the store cannot tell when
	 * the connection dropped and so does not refresh after a reconnect.
	 */
	connection?: ConnectionEvents;
	/** How long a query keeps running after its last subscriber leaves. Default 100. */
	idleMs?: number;
	/** How long to wait for further changes before reading a filtered query again. Default 20. */
	debounceMs?: number;
};

/** The part of a `Surreal` instance the store listens to. */
export type ConnectionEvents = {
	subscribe(
		event: "connected" | "reconnecting" | "disconnected",
		listener: () => void,
	): () => void;
};

export type QueryOptions<T> = {
	/** Order the rows of an unfiltered query. Filtered queries order themselves with `.orderBy()`. */
	sort?: (a: T, b: T) => number;
};

type Row<Q> = Awaited<Q> extends readonly (infer R)[] ? R : Awaited<Q>;

const isConnectionEvents = (value: unknown): value is ConnectionEvents =>
	typeof (value as ConnectionEvents | undefined)?.subscribe === "function";

/** A stable key for a query: its text and what it binds. */
function keyOf(text: string, bindings: unknown): string {
	return `${text}\u0000${JSON.stringify(bindings, (_, value) =>
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) !== Object.prototype
			? String(value)
			: value,
	)}`;
}

/**
 * Live views of queries. Ask for a query with {@link Store.query} and
 * subscribe to the {@link QueryStore} it returns; asking for the same query
 * again returns the same store, so every component that shows it shares one
 * live subscription.
 *
 * ```ts
 * const store = createStore(db);
 * const open = store.query("task", (q) => q.where({ done: false }));
 *
 * const stop = open.subscribe(() => render(open.getSnapshot()));
 * ```
 */
export class Store<O extends Orm> {
	readonly #stores = new Map<string, QueryStore<unknown>>();
	readonly #idleMs: number;
	readonly #debounceMs: number;
	readonly #connection: ConnectionEvents | undefined;

	constructor(
		readonly db: O,
		options: StoreOptions = {},
	) {
		this.#idleMs = options.idleMs ?? 100;
		this.#debounceMs = options.debounceMs ?? 20;
		const candidate = options.connection ?? db.surreal;
		this.#connection = isConnectionEvents(candidate) ? candidate : undefined;
	}

	/**
	 * Every record of a table, kept current from the table's live notifications.
	 */
	query<Tb extends keyof O["tables"] & string>(
		tb: Tb,
		build?: undefined,
		options?: QueryOptions<O["tables"][Tb]["schema"]["infer"]>,
	): QueryStore<O["tables"][Tb]["schema"]["infer"]>;

	/**
	 * The result of a query built from `SELECT FROM <table>`: filtered, ordered,
	 * limited, projected or with `FETCH`. Any change to the table runs it again,
	 * because a live query cannot say when a record stops matching a filter.
	 */
	query<Tb extends keyof O["tables"] & string, Q extends PromiseLike<unknown>>(
		tb: Tb,
		build: (q: SelectQuery<O, WorkableContext<O>, Tb>) => Q,
	): QueryStore<Row<Q>>;

	query(
		tb: string,
		build?: (q: never) => unknown,
		options: QueryOptions<never> = {},
		// biome-ignore lint/suspicious/noExplicitAny: the overloads give the row type
	): QueryStore<any> {
		const db = this.db as Orm;
		const select = (db.select as (tb: string) => unknown)(tb);
		const query = (build ? build(select as never) : select) as {
			execute(): Promise<unknown>;
			prepare(): { query: string; bindings: unknown };
		};
		const prepared = query.prepare();
		const key = `${build ? "refetch" : "direct"}\u0000${keyOf(prepared.query, prepared.bindings)}`;

		const existing = this.#stores.get(key);
		if (existing) return existing;

		const store = new QueryStore<unknown>({
			mode: build ? "refetch" : "direct",
			fetch: async () => {
				const result = await query.execute();
				if (Array.isArray(result)) return result;
				return result == null ? [] : [result];
			},
			live: (handler) =>
				(
					db.live as (tb: string) => {
						subscribe(
							h: (m: LiveMessage<unknown>) => void,
						): Promise<() => void>;
					}
				)(tb).subscribe(handler),
			keyOf: (row) => String((row as { id: RecordId }).id),
			keyOfId: (id) => String(id),
			sort: options.sort as ((a: unknown, b: unknown) => number) | undefined,
			onConnection: this.#connection && ((listener) => this.#listen(listener)),
			onDispose: () => this.#stores.delete(key),
			idleMs: this.#idleMs,
			debounceMs: this.#debounceMs,
		});
		this.#stores.set(key, store);
		return store;
	}

	#listen(listener: (signal: ConnectionSignal) => void): () => void {
		const connection = this.#connection as ConnectionEvents;
		const offs = [
			connection.subscribe("connected", () => listener("connected")),
			connection.subscribe("reconnecting", () => listener("disconnected")),
			connection.subscribe("disconnected", () => listener("disconnected")),
		];
		return () => {
			for (const off of offs) off();
		};
	}
}

/** Create a {@link Store} over an ORM. */
export function createStore<O extends Orm>(
	db: O,
	options?: StoreOptions,
): Store<O> {
	return new Store(db, options);
}

export type { StoreSnapshot };
