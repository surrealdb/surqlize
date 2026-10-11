import { decode, encode } from "./codec";

/** One write waiting to be sent. */
export type OutboxOp = {
	table: string;
	/** The id part of the record id, such as `"a1"` in `task:a1`. */
	id: unknown;
	kind: "create" | "update" | "delete";
	/** The fields to write; none for a delete. */
	data?: Record<string, unknown>;
};

/** Where pending writes are kept, so that they survive a reload. */
export interface OutboxStorage {
	/** Every stored write, in any order. */
	load(): Promise<ReadonlyArray<{ seq: number; payload: string }>>;
	/** Store a write, or replace the one with this `seq`. */
	put(seq: number, payload: string): Promise<void>;
	remove(seq: number): Promise<void>;
}

/** Pending writes kept in memory only: lost with the page, but works everywhere. */
export function memoryStorage(): OutboxStorage {
	const entries = new Map<number, string>();
	return {
		async load() {
			return [...entries].map(([seq, payload]) => ({ seq, payload }));
		},
		async put(seq, payload) {
			entries.set(seq, payload);
		},
		async remove(seq) {
			entries.delete(seq);
		},
	};
}

/**
 * Pending writes kept in IndexedDB, so they are still there after a reload and
 * are sent when the store next starts. Needs a browser (or a runtime with an
 * `indexedDB` global).
 */
export function indexedDbStorage(name = "surqlize-outbox"): OutboxStorage {
	const STORE = "ops";
	let opened: Promise<IDBDatabase> | undefined;

	const open = () => {
		opened ??= new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(name, 1);
			request.onupgradeneeded = () => request.result.createObjectStore(STORE);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return opened;
	};

	const run = async <R>(
		mode: IDBTransactionMode,
		work: (store: IDBObjectStore) => IDBRequest<R>,
	): Promise<R> => {
		const db = await open();
		return new Promise<R>((resolve, reject) => {
			const request = work(db.transaction(STORE, mode).objectStore(STORE));
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	};

	return {
		async load() {
			const db = await open();
			return new Promise((resolve, reject) => {
				const out: { seq: number; payload: string }[] = [];
				const request = db
					.transaction(STORE, "readonly")
					.objectStore(STORE)
					.openCursor();
				request.onsuccess = () => {
					const cursor = request.result;
					if (!cursor) return resolve(out);
					out.push({ seq: Number(cursor.key), payload: String(cursor.value) });
					cursor.continue();
				};
				request.onerror = () => reject(request.error);
			});
		},
		async put(seq, payload) {
			await run("readwrite", (s) => s.put(payload, seq));
		},
		async remove(seq) {
			await run("readwrite", (s) => s.delete(seq));
		},
	};
}

/** What {@link Outbox} needs from the store that owns it. */
export type OutboxDeps = {
	storage: OutboxStorage;
	/** Send a write to the database. Resolves to the stored record, if there is one. */
	send(op: OutboxOp): Promise<unknown>;
	/** Called with the result of a write the database accepted, before it leaves the outbox. */
	acknowledge(op: OutboxOp, row: unknown): void;
	/** Whether an error means the write was refused, so that retrying cannot help. */
	isPermanent(error: unknown): boolean;
	/** Whether the connection is up. Without a signal, assumed to be. */
	isOnline(): boolean;
	/** The first and the longest wait before sending again after a failed attempt. */
	retry: { minMs: number; maxMs: number };
};

type Entry = {
	seq: number;
	op: OutboxOp;
	inFlight: boolean;
	waiters: { resolve(row: unknown): void; reject(error: unknown): void }[];
};

/**
 * Writes that have been made locally and not yet accepted by the database, in
 * order. A write stays here until the database accepts or refuses it:
 * a connection problem keeps it queued to be sent again, a refusal removes it
 * and rejects it.
 *
 * Writes to the same record that have not been sent yet are merged into one,
 * so editing a field a hundred times offline sends one write.
 */
export class Outbox {
	#entries: Entry[] = [];
	#counter = 0;
	#snapshot: readonly OutboxOp[] = Object.freeze([]);
	readonly #listeners = new Set<() => void>();
	#flushing = false;
	#loaded = false;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#attempt = 0;
	/** Resolves once the writes of an earlier session have been loaded. */
	readonly ready: Promise<void>;

	constructor(private readonly deps: OutboxDeps) {
		this.ready = this.#load();
	}

	/** The writes waiting to be sent, oldest first. The same array until it changes. */
	getSnapshot = (): readonly OutboxOp[] => this.#snapshot;

	/** Subscribe to changes of the waiting writes. */
	subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	};

	/** The pending writes to one table, in the order they were made. */
	forTable(table: string): OutboxOp[] {
		return this.#entries.filter((e) => e.op.table === table).map((e) => e.op);
	}

	/**
	 * Queue a write. Resolves with the stored record once the database accepted
	 * it, and rejects if it refused it, or if the write cannot be stored.
	 */
	enqueue(op: OutboxOp): Promise<unknown> {
		// Once the earlier session's writes are loaded, a write is applied
		// synchronously, so it shows before the call returns.
		if (!this.#loaded) return this.ready.then(() => this.enqueue(op));
		return new Promise<unknown>((resolve, reject) => {
			const waiter = { resolve, reject };
			const target = this.#mergeTarget(op);
			const previous = target?.op;
			let entry: Entry;
			if (target) {
				target.op = { ...target.op, data: { ...target.op.data, ...op.data } };
				target.waiters.push(waiter);
				entry = target;
			} else {
				entry = {
					seq: ++this.#counter,
					op: { ...op },
					inFlight: false,
					waiters: [waiter],
				};
				this.#entries.push(entry);
			}
			// The write is visible straight away; it is stored before it is sent.
			this.#changed();
			this.deps.storage.put(entry.seq, encode(entry.op)).then(
				() => {
					void this.flush();
				},
				(error) => {
					if (previous) {
						entry.op = previous;
						entry.waiters = entry.waiters.filter((w) => w !== waiter);
					} else {
						this.#entries = this.#entries.filter((e) => e !== entry);
					}
					this.#changed();
					reject(error);
				},
			);
		});
	}

	/**
	 * The unsent write an update can be folded into: the latest write to the same
	 * record, if it has not been sent and is not a delete. Writes to other
	 * records in between do not matter, as each record is written in order.
	 */
	#mergeTarget(op: OutboxOp): Entry | undefined {
		if (op.kind !== "update") return undefined;
		for (let i = this.#entries.length - 1; i >= 0; i--) {
			const entry = this.#entries[i] as Entry;
			if (entry.op.table !== op.table || !sameId(entry.op.id, op.id)) continue;
			return entry.inFlight || entry.op.kind === "delete" ? undefined : entry;
		}
		return undefined;
	}

	async #load(): Promise<void> {
		const stored = await this.deps.storage.load();
		const sorted = [...stored].sort((a, b) => a.seq - b.seq);
		this.#counter = sorted.at(-1)?.seq ?? 0;
		this.#entries = sorted.map(({ seq, payload }) => ({
			seq,
			op: decode(payload) as OutboxOp,
			inFlight: false,
			waiters: [],
		}));
		this.#loaded = true;
		this.#changed();
		void this.flush();
	}

	#changed(): void {
		this.#snapshot = Object.freeze(this.#entries.map((e) => e.op));
		for (const listener of [...this.#listeners]) listener();
	}

	/**
	 * Send the waiting writes, oldest first, until one cannot be sent for want of
	 * a connection. Safe to call at any time; only one run happens at once.
	 */
	async flush(): Promise<void> {
		if (this.#flushing) return;
		this.#flushing = true;
		clearTimeout(this.#timer);
		this.#timer = undefined;
		try {
			while (this.#entries.length > 0 && this.deps.isOnline()) {
				if (!(await this.#sendFirst())) return;
			}
		} finally {
			this.#flushing = false;
		}
	}

	/** Send the oldest write. Returns whether to carry on with the next. */
	async #sendFirst(): Promise<boolean> {
		const entry = this.#entries[0] as Entry;
		entry.inFlight = true;
		try {
			const row = await this.deps.send(entry.op);
			this.deps.acknowledge(entry.op, row);
			await this.#finish(entry, (w) => w.resolve(row));
			this.#attempt = 0;
			return true;
		} catch (error) {
			entry.inFlight = false;
			if (this.deps.isPermanent(error)) {
				await this.#finish(entry, (w) => w.reject(error));
				return true;
			}
			this.#scheduleRetry();
			return false;
		}
	}

	async #finish(
		entry: Entry,
		settle: (w: Entry["waiters"][number]) => void,
	): Promise<void> {
		this.#entries = this.#entries.filter((e) => e !== entry);
		await this.deps.storage.remove(entry.seq).catch(() => {});
		this.#changed();
		for (const waiter of entry.waiters) settle(waiter);
	}

	#scheduleRetry(): void {
		const { minMs, maxMs } = this.deps.retry;
		const wait = Math.min(maxMs, minMs * 2 ** this.#attempt++);
		this.#timer = setTimeout(() => {
			this.#timer = undefined;
			void this.flush();
		}, wait);
	}

	/** Stop retrying. Writes stay in storage and are sent when a store starts again. */
	dispose(): void {
		clearTimeout(this.#timer);
		this.#timer = undefined;
	}
}

const sameId = (a: unknown, b: unknown): boolean => encode(a) === encode(b);
