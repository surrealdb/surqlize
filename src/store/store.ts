import {
	isRetryableConflict,
	RecordId,
	type RecordIdValue,
	ServerError,
	toSurqlString,
} from "surrealdb";
import { OrmError } from "../error";
import type { LiveMessage } from "../query/live";
import type { CreateInput } from "../query/modification-methods";
import type { SelectQuery } from "../query/select";
import type { Orm } from "../schema/orm";
import type { WorkableContext } from "../utils";
import { matchesWhere } from "./match";
import {
	memoryStorage,
	Outbox,
	type OutboxOp,
	type OutboxStorage,
} from "./outbox";
import { applyOverlay } from "./overlay";
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
	/**
	 * Where writes that have not reached the database are kept. The default is
	 * memory: they are sent again after a reconnect, but lost with the page. Use
	 * {@link indexedDbStorage} to keep them across reloads.
	 */
	storage?: OutboxStorage;
	/** The first and the longest wait before sending a write again. Default 500 and 30000. */
	retry?: { minMs?: number; maxMs?: number };
	/**
	 * Holds the store off the database until it resolves, for a connection that
	 * has to be signed in first. Until then the store registers no live query,
	 * reads nothing and sends no write; a write made meanwhile is queued and shown
	 * at once, and one kept in `storage` from an earlier session waits too.
	 *
	 * It is called the first time something needs the connection: the first
	 * subscriber of a query, a write, or `refetch()`. Never when the store is made,
	 * never again once it has resolved, and never twice at once. A write kept in
	 * `storage` does not call it by itself; it waits for one of those. If it
	 * rejects, queries report the error, writes stay queued and are not rejected,
	 * and the next write, `refetch()`, or subscriber of a query that is not running
	 * calls it again; a query that failed to start is started over by `refetch()`
	 * or a new subscriber. It is not called again after a reconnect.
	 */
	gate?: () => Promise<void>;
};

/** What a write call returns: the record it is about, and when the database has settled it. */
export type Write<Tb extends string, Row> = {
	/** The id of the record, known straight away, including for a create that was given none. */
	id: RecordId<Tb>;
	/**
	 * Resolves with the stored record once the database accepts the write, or
	 * `undefined` for a delete. Rejects if the database refuses it, in which case
	 * the change is taken back. While offline it stays pending, and the write is
	 * sent when the connection returns.
	 */
	committed: Promise<Row | undefined>;
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

type ClientFilter = {
	where: Record<string, unknown> | undefined;
	ordered: boolean;
};

const isConnectionEvents = (value: unknown): value is ConnectionEvents =>
	typeof (value as ConnectionEvents | undefined)?.subscribe === "function";

/** A stable key for a query: its text and what it binds. */
function keyOf(text: string, bindings: unknown): string {
	return `${text}\u0000${keyOfValue(bindings, [])}`;
}

/**
 * A string for a binding, different for values that differ. Each kind of
 * container is tagged, so that a `Set` and an array of the same items do not
 * share a key, and bytes are written out. A value of the SDK (a record id, a
 * decimal, a datetime) is written as SurrealQL, which keeps it apart from the
 * text and the number it prints as, and does not depend on a class name that a
 * bundler may have changed. Any other instance of a class is told apart by its
 * class name only, so two of one class share a key. Never throws.
 */
function keyOfValue(value: unknown, parents: object[]): string {
	switch (typeof value) {
		case "string":
			return JSON.stringify(value);
		case "bigint":
			return `${value}n`;
		case "symbol":
			return `symbol(${value.description ?? ""})`;
		case "function":
			return `function(${value.name})`;
		case "object":
			break;
		default:
			return String(value);
	}
	if (value === null) return "null";
	if (parents.includes(value)) return "[circular]";
	const inner = [...parents, value];
	const each = (items: Iterable<unknown>) =>
		[...items].map((item) => keyOfValue(item, inner)).join(",");

	if (Array.isArray(value)) return `[${each(value)}]`;
	if (value instanceof Set) return `set[${each(value)}]`;
	if (value instanceof Map)
		return `map[${[...value].map(([k, v]) => `${keyOfValue(k, inner)}=>${keyOfValue(v, inner)}`).join(",")}]`;
	if (value instanceof ArrayBuffer) return `buffer(${hex(value)})`;
	if (ArrayBuffer.isView(value))
		return `${value.constructor.name}(${hex(value.buffer, value.byteOffset, value.byteLength)})`;
	if (value instanceof Date) return `date(${value.getTime()})`;
	const proto = Object.getPrototypeOf(value);
	if (proto === Object.prototype || proto === null) {
		const entries = Object.entries(value).map(
			([k, v]) => `${JSON.stringify(k)}:${keyOfValue(v, inner)}`,
		);
		return `{${entries.join(",")}}`;
	}
	try {
		const text = toSurqlString(value);
		if (!text.startsWith("[object ")) return text;
	} catch {
		// No form of its own: told apart by its class below.
	}
	return `class(${(value as object).constructor?.name ?? "unknown"})`;
}

const hex = (buffer: ArrayBufferLike, offset = 0, length?: number): string =>
	Array.from(new Uint8Array(buffer, offset, length), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");

/**
 * The key of a row, or `undefined` for one that is not a record: a projection
 * need not select `id`, or return an object at all.
 */
function recordKey(row: unknown): string | undefined {
	const id = (row as { id?: unknown } | null | undefined)?.id;
	return id === undefined || id === null ? undefined : String(id);
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
	readonly #stores = new Map<
		string,
		{ query: QueryStore<unknown>; stop: () => void }
	>();
	readonly #idleMs: number;
	readonly #debounceMs: number;
	readonly #connection: ConnectionEvents | undefined;
	readonly #outbox: Outbox;
	readonly #gate: (() => Promise<void>) | undefined;
	#gateOpen: boolean;
	#opening: Promise<void> | undefined;

	/**
	 * Writes that have not been accepted by the database yet, oldest first. The
	 * same array is returned until it changes.
	 */
	readonly pending: {
		subscribe(listener: () => void): () => void;
		getSnapshot(): readonly OutboxOp[];
	};

	/** Resolves once the writes of an earlier session have been loaded from storage. */
	readonly ready: Promise<void>;

	constructor(
		readonly db: O,
		options: StoreOptions = {},
	) {
		this.#idleMs = options.idleMs ?? 100;
		this.#debounceMs = options.debounceMs ?? 20;
		const candidate = options.connection ?? db.surreal;
		this.#connection = isConnectionEvents(candidate) ? candidate : undefined;
		this.#gate = options.gate;
		this.#gateOpen = options.gate === undefined;
		this.#outbox = new Outbox({
			storage: options.storage ?? memoryStorage(),
			send: (op) => this.#send(op),
			acknowledge: (op, row) => this.#acknowledge(op, row),
			// A write that lost a race with another one was not applied, and sending it
			// again cannot count it twice, so it is not a refusal. Only a server that
			// reports the conflict in a structured way (3.1.0 or later) is recognised.
			isPermanent: (error) =>
				!isRetryableConflict(error) &&
				(error instanceof ServerError || error instanceof OrmError),
			isOnline: () =>
				(this.#connection === undefined || this.#online) && this.#gateOpen,
			onWrite: () => {
				if (!this.#gateOpen) void this.#open().catch(() => {});
			},
			retry: {
				minMs: options.retry?.minMs ?? 500,
				maxMs: options.retry?.maxMs ?? 30_000,
			},
		});
		this.pending = this.#outbox;
		this.ready = this.#outbox.ready;
		this.#watchConnection();
	}

	#online = true;
	#unwatch: (() => void)[] = [];

	/** Keep track of the connection, and send waiting writes when it returns. */
	#watchConnection(): void {
		const connection = this.#connection;
		if (!connection) return;
		this.#unwatch.push(
			connection.subscribe("connected", () => {
				this.#online = true;
				void this.#outbox.flush();
			}),
		);
		for (const event of ["reconnecting", "disconnected"] as const) {
			this.#unwatch.push(
				connection.subscribe(event, () => {
					this.#online = false;
				}),
			);
		}
	}

	/**
	 * Stop everything the store started: its listeners on the connection, the
	 * sending of the writes that are still waiting, and every running query, even
	 * one that is subscribed. For a store made for a short-lived scope, such as a
	 * request or a test, so that it does not outlive it. A write that is on its
	 * way ends as the database answers, but none is sent or retried after it.
	 * Writes that are waiting stay in storage, and are sent when a store starts
	 * over it again.
	 */
	dispose(): void {
		for (const off of this.#unwatch) off();
		this.#unwatch = [];
		this.#outbox.dispose();
		for (const { stop } of [...this.#stores.values()]) stop();
	}

	/**
	 * Open the gate, if there is one and it is not open yet. Only one call to it
	 * is made at a time, and a failed one is forgotten, so the next need tries
	 * again. Writes that were held are sent once it has opened.
	 */
	#open(): Promise<void> {
		this.#opening ??= (async () => this.#gate?.())().then(
			() => {
				this.#opening = undefined;
				this.#gateOpen = true;
				void this.#outbox.flush();
			},
			(error) => {
				this.#opening = undefined;
				throw error;
			},
		);
		return this.#opening;
	}

	/** `run`, after the gate has opened. Not wrapped at all when there is no gate. */
	#gated<T>(run: () => Promise<T>): () => Promise<T> {
		if (!this.#gate) return run;
		return async () => {
			if (!this.#gateOpen) await this.#open();
			return run();
		};
	}

	async #send(op: OutboxOp): Promise<unknown> {
		const db = this.db as unknown as Record<
			string,
			(
				tb: string,
				id: unknown,
			) => {
				content(data: unknown): { execute(): Promise<unknown[]> };
				merge(data: unknown): { execute(): Promise<unknown[]> };
				execute(): Promise<unknown[]>;
			}
		>;
		if (op.kind === "delete") {
			await db.delete?.(op.table, op.id)?.execute();
			return undefined;
		}
		// A create is an upsert of the whole record, so sending it again after a
		// lost answer leaves the same record rather than failing as a duplicate.
		const query =
			op.kind === "create"
				? db.upsert?.(op.table, op.id)?.content(op.data ?? {})
				: db.update?.(op.table, op.id)?.merge(op.data ?? {});
		const [row] = (await query?.execute()) ?? [];
		if (row === undefined) {
			throw new OrmError(
				`${op.table}:${String(op.id)} does not exist, so it cannot be updated`,
			);
		}
		return row;
	}

	/** Record the result of an accepted write in every running query of its table. */
	#acknowledge(op: OutboxOp, row: unknown): void {
		const key = String(new RecordId(op.table, op.id as never));
		for (const { query } of this.#stores.values()) {
			if (query.table === op.table) query.acknowledge({ key, row });
		}
	}

	/**
	 * Make writes to a table. Each applies to every query of the table at once,
	 * and is sent to the database in order.
	 *
	 * ```ts
	 * const tasks = store.table("task");
	 * const { id, committed } = tasks.create({ title: "Write docs", done: false });
	 * tasks.update(id, { done: true });
	 * await committed;
	 * ```
	 *
	 * Updates merge top-level fields, and the last write to a field wins.
	 */
	table<Tb extends keyof O["tables"] & string>(tb: Tb): TableWriter<O, Tb> {
		return new TableWriter(tb, this.#outbox);
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
		// A query that is a plain filter can be checked against records on the
		// client, which lets a local write enter or leave the result at once.
		const filter = build
			? (
					query as { clientFilter?: () => ClientFilter | undefined }
				).clientFilter?.()
			: undefined;
		const prepared = query.prepare();
		const key = `${build ? "refetch" : "direct"}\u0000${keyOf(prepared.query, prepared.bindings)}`;

		const existing = this.#stores.get(key);
		if (existing) return existing.query;

		let stop = () => {};
		const store = new QueryStore<unknown>({
			table: tb,
			mode: build ? "refetch" : "direct",
			overlay: {
				apply: (rows, direct) => {
					const ops = this.#outbox.forTable(tb);
					if (direct) return applyOverlay(rows, ops, recordKey, true);
					if (!filter) return applyOverlay(rows, ops, recordKey, false);
					return applyOverlay(
						rows,
						ops,
						recordKey,
						(row) =>
							!filter.ordered &&
							matchesWhere(filter.where, row, { partial: true }) === true,
						(row) => matchesWhere(filter.where, row) !== false,
					);
				},
				subscribe: this.#outbox.subscribe,
			},
			membership: filter ? (row) => matchesWhere(filter.where, row) : undefined,
			insertable: filter ? !filter.ordered : false,
			fetch: this.#gated(async () => {
				const result = await query.execute();
				if (Array.isArray(result)) return result;
				return result == null ? [] : [result];
			}),
			live: (handler) =>
				this.#gated(() =>
					(
						db.live as (tb: string) => {
							subscribe(
								h: (m: LiveMessage<unknown>) => void,
							): Promise<() => void>;
						}
					)(tb).subscribe(handler),
				)(),
			// A row with no key is the record of no write.
			keyOf: (row) => recordKey(row) ?? "",
			keyOfId: (id) => String(id),
			sort: options.sort as ((a: unknown, b: unknown) => number) | undefined,
			onConnection: this.#connection && ((listener) => this.#listen(listener)),
			// A query that was stopped and replaced can still stop again, when a holder
			// of it subscribes and leaves: it must not forget the one that replaced it.
			onDispose: () => {
				if (this.#stores.get(key)?.query === store) this.#stores.delete(key);
			},
			registerStop: (stopQuery) => {
				stop = stopQuery;
			},
			idleMs: this.#idleMs,
			debounceMs: this.#debounceMs,
		});
		this.#stores.set(key, { query: store, stop });
		return store;
	}

	#listen(listener: (signal: ConnectionSignal) => void): () => void {
		const connection = this.#connection as ConnectionEvents;
		const offs = [
			// Writes go first, so that the read that follows includes them.
			connection.subscribe("connected", () => {
				void this.#outbox.flush().finally(() => listener("connected"));
			}),
			connection.subscribe("reconnecting", () => listener("disconnected")),
			connection.subscribe("disconnected", () => listener("disconnected")),
		];
		return () => {
			for (const off of offs) off();
		};
	}
}

type Schema<
	O extends Orm,
	Tb extends keyof O["tables"] & string,
> = O["tables"][Tb]["schema"];
type RowOf<O extends Orm, Tb extends keyof O["tables"] & string> = Schema<
	O,
	Tb
>["infer"];

const idValue = (id: RecordIdValue | RecordId): unknown =>
	id instanceof RecordId ? id.id : id;

const newId = (): string => globalThis.crypto.randomUUID().replaceAll("-", "");

/** Writes to one table, made through {@link Store.table}. */
export class TableWriter<O extends Orm, Tb extends keyof O["tables"] & string> {
	constructor(
		private readonly tb: Tb,
		private readonly outbox: Outbox,
	) {}

	#write(kind: OutboxOp["kind"], id: unknown, data?: Record<string, unknown>) {
		const committed = this.outbox.enqueue({
			table: this.tb,
			id,
			kind,
			data,
		}) as Promise<RowOf<O, Tb> | undefined>;
		return { id: new RecordId(this.tb, id as never), committed } as Write<
			Tb,
			RowOf<O, Tb>
		>;
	}

	/**
	 * Create a record. Without an `id`, one is generated here, so the record can
	 * be used straight away, before the database has seen it.
	 */
	create(
		data: CreateInput<Schema<O, Tb>>,
		options: { id?: RecordIdValue } = {},
	): Write<Tb, RowOf<O, Tb>> {
		return this.#write(
			"create",
			options.id ?? newId(),
			data as Record<string, unknown>,
		);
	}

	/** Change fields of a record. Other fields are left as they are. */
	update(
		id: RecordIdValue | RecordId<Tb>,
		data: Partial<RowOf<O, Tb>>,
	): Write<Tb, RowOf<O, Tb>> {
		return this.#write("update", idValue(id), data as Record<string, unknown>);
	}

	/** Delete a record. Deleting one that does not exist is not an error. */
	delete(id: RecordIdValue | RecordId<Tb>): Write<Tb, RowOf<O, Tb>> {
		return this.#write("delete", idValue(id));
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
