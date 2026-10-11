import type { LiveMessage } from "../query/live";

/**
 * What a {@link QueryStore} holds. A new object is produced whenever it
 * changes and the same object is returned until then, as
 * `useSyncExternalStore` and similar bindings require.
 *
 * - `loading`: the first result has not arrived.
 * - `success`: `data` is the current result. `stale` is `true` while the
 *   connection is down, so `data` may be missing changes made in the meantime;
 *   it is refreshed when the connection returns.
 * - `error`: loading failed, or the live subscription was killed. Call
 *   {@link QueryStore.refetch} to try again.
 */
export type StoreSnapshot<T> =
	| { readonly status: "loading" }
	| {
			readonly status: "success";
			readonly data: readonly T[];
			readonly stale: boolean;
	  }
	| { readonly status: "error"; readonly error: unknown };

/** How a store learns what changed: apply each notification, or ask again. */
export type StoreMode = "direct" | "refetch";

/** The connection events a store reacts to. */
export type ConnectionSignal = "connected" | "disconnected";

export type QueryStoreDeps<T> = {
	/**
	 * `direct`: every notification carries the full record, so it is applied to
	 * the result as it is. Only valid when the result is every record of the
	 * table. `refetch`: the result may depend on a filter, an order or a
	 * projection, so any change to the table runs the query again.
	 *
	 * A live query with a `WHERE` sends nothing when an update makes a record
	 * stop matching, so a filtered result cannot be kept up to date from its
	 * notifications; the store subscribes to the whole table instead.
	 */
	mode: StoreMode;
	/** Run the query and return its rows. */
	fetch(): Promise<T[]>;
	/** Subscribe to every change of the table. Resolves to a function that stops. */
	live(handler: (message: LiveMessage<T>) => void): Promise<() => void>;
	/** The identity of a record, to apply a notification to the right row. */
	keyOf(row: T): string;
	/** The identity of the record a notification is about. */
	keyOfId(id: unknown): string;
	/** Order the rows of a `direct` result. Rows are otherwise in arrival order. */
	sort?: (a: T, b: T) => number;
	/** Tell the store when the connection drops and returns. */
	onConnection?(listener: (signal: ConnectionSignal) => void): () => void;
	/** Called once the store has no subscribers and has shut down. */
	onDispose?(): void;
	/** How long to keep running after the last subscriber leaves. */
	idleMs: number;
	/** How long to wait for further changes before running a `refetch` query again. */
	debounceMs: number;
};

const LOADING: StoreSnapshot<never> = Object.freeze({ status: "loading" });

/**
 * A live view of a query, shaped for `useSyncExternalStore`: `subscribe` and
 * `getSnapshot`. Created through {@link Store.query}, which shares one store
 * between everything that asks for the same query.
 *
 * It starts with its first subscriber and stops shortly after the last one
 * leaves, so a component that unmounts and mounts again straight away (React
 * StrictMode does this) does not tear down and set up the live query.
 */
export class QueryStore<T> {
	#snapshot: StoreSnapshot<T> = LOADING;
	readonly #listeners = new Set<() => void>();
	readonly #rows = new Map<string, T>();

	#running = false;
	#stopLive: (() => void) | undefined;
	#stopConnection: (() => void) | undefined;
	#idle: ReturnType<typeof setTimeout> | undefined;
	#debounce: ReturnType<typeof setTimeout> | undefined;

	/** Notifications received while a load is in flight, applied once it ends. */
	#buffer: LiveMessage<T>[] | undefined;
	#loading = false;
	#dirty = false;
	#stale = false;
	/** Distinguishes a load that was superseded by a restart. */
	#epoch = 0;

	constructor(private readonly deps: QueryStoreDeps<T>) {}

	/** Subscribe to changes of the snapshot. Returns a function that unsubscribes. */
	subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener);
		clearTimeout(this.#idle);
		this.#idle = undefined;
		if (!this.#running) void this.#start();
		return () => {
			this.#listeners.delete(listener);
			if (this.#listeners.size === 0) this.#scheduleStop();
		};
	};

	/** The current snapshot. The same object is returned until something changes. */
	getSnapshot = (): StoreSnapshot<T> => this.#snapshot;

	/** Run the query again now and replace the result with what it returns. */
	refetch(): Promise<void> {
		return this.#load();
	}

	#publish(next: StoreSnapshot<T>): void {
		this.#snapshot = next;
		for (const listener of [...this.#listeners]) listener();
	}

	#publishRows(): void {
		const data = [...this.#rows.values()];
		if (this.deps.sort) data.sort(this.deps.sort);
		this.#publish(
			Object.freeze({
				status: "success",
				data: Object.freeze(data),
				stale: this.#stale,
			}),
		);
	}

	#publishData(data: readonly T[]): void {
		this.#publish(
			Object.freeze({
				status: "success",
				data: Object.freeze([...data]),
				stale: this.#stale,
			}),
		);
	}

	async #start(): Promise<void> {
		this.#running = true;
		const epoch = ++this.#epoch;
		// Notifications that arrive before the first result are kept and applied on
		// top of it, so a change made while the query runs is not lost.
		this.#buffer = [];
		try {
			const stop = await this.deps.live((message) => this.#onMessage(message));
			if (!this.#running || epoch !== this.#epoch) {
				stop();
				return;
			}
			this.#stopLive = stop;
			this.#stopConnection = this.deps.onConnection?.((signal) =>
				this.#onConnection(signal),
			);
			await this.#load();
		} catch (error) {
			if (epoch === this.#epoch)
				this.#publish(Object.freeze({ status: "error", error }));
		}
	}

	async #load(): Promise<void> {
		if (this.#loading) {
			// A load is running; run once more when it ends so nothing is missed.
			this.#dirty = true;
			return;
		}
		this.#loading = true;
		const epoch = this.#epoch;
		try {
			do {
				this.#dirty = false;
				this.#buffer ??= [];
				const rows = await this.deps.fetch();
				if (epoch !== this.#epoch || !this.#running) return;
				this.#accept(rows);
			} while (this.#dirty && this.#running);
		} catch (error) {
			if (epoch === this.#epoch) this.#failLoad(error);
		} finally {
			this.#loading = false;
		}
	}

	/** Make `rows` the result, with the notifications that arrived while it was read on top. */
	#accept(rows: T[]): void {
		const buffered = this.#buffer ?? [];
		this.#buffer = undefined;
		this.#stale = false;
		if (this.deps.mode === "refetch") {
			this.#publishData(rows);
			return;
		}
		this.#rows.clear();
		for (const row of rows) this.#rows.set(this.deps.keyOf(row), row);
		for (const message of buffered) this.#apply(message);
		this.#publishRows();
	}

	#failLoad(error: unknown): void {
		this.#buffer = undefined;
		// A refresh that fails keeps the data it has; only a first load is an error.
		if (this.#snapshot.status === "success") this.#publishStale(true);
		else this.#publish(Object.freeze({ status: "error", error }));
	}

	#publishStale(stale: boolean): void {
		this.#stale = stale;
		if (this.#snapshot.status !== "success") return;
		if (this.#snapshot.stale === stale) return;
		this.#publish(Object.freeze({ ...this.#snapshot, stale }));
	}

	#onMessage(message: LiveMessage<T>): void {
		if (message.action === "KILLED") {
			this.#publish(
				Object.freeze({
					status: "error",
					error: new Error("The live subscription was killed by the server"),
				}),
			);
			return;
		}
		if (this.deps.mode === "refetch") {
			this.#scheduleRefetch();
		} else if (this.#buffer) {
			this.#buffer.push(message);
		} else {
			this.#apply(message);
			this.#publishRows();
		}
	}

	#apply(message: LiveMessage<T>): void {
		if (message.action === "KILLED") return;
		const key = this.deps.keyOfId(message.recordId);
		if (message.action === "DELETE") this.#rows.delete(key);
		else this.#rows.set(key, message.value);
	}

	#scheduleRefetch(): void {
		if (this.#loading) {
			this.#dirty = true;
			return;
		}
		clearTimeout(this.#debounce);
		this.#debounce = setTimeout(() => {
			this.#debounce = undefined;
			void this.#load();
		}, this.deps.debounceMs);
	}

	#onConnection(signal: ConnectionSignal): void {
		if (signal === "disconnected") {
			this.#publishStale(true);
		} else if (this.#stale) {
			// Changes made while the connection was down were not delivered, so the
			// result is read again rather than assumed to be current.
			this.#buffer = [];
			void this.#load();
		}
	}

	#scheduleStop(): void {
		clearTimeout(this.#idle);
		this.#idle = setTimeout(() => this.#stop(), this.deps.idleMs);
	}

	#stop(): void {
		this.#idle = undefined;
		this.#running = false;
		this.#epoch++;
		clearTimeout(this.#debounce);
		this.#debounce = undefined;
		this.#stopLive?.();
		this.#stopLive = undefined;
		this.#stopConnection?.();
		this.#stopConnection = undefined;
		this.#rows.clear();
		this.#buffer = undefined;
		this.#loading = false;
		this.#dirty = false;
		this.#stale = false;
		this.#snapshot = LOADING;
		this.deps.onDispose?.();
	}
}
