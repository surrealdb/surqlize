import {
	type LiveAction,
	type RecordId,
	type SurrealSession,
	Table,
	type Uuid,
} from "surrealdb";
import type { Orm } from "../schema/orm.ts";
import { type AbstractType, ObjectType, type RecordType } from "../types";
import { type Actionable, actionable } from "../utils/actionable.ts";
import { type DisplayContext, displayContext } from "../utils/display.ts";
import {
	type Inheritable,
	type InheritableIntoType,
	inheritableIntoWorkable,
} from "../utils/inheritable.ts";
import {
	__ctx,
	__display,
	__type,
	isWorkable,
	sanitizeWorkable,
	type Workable,
	type WorkableContext,
} from "../utils/workable.ts";
import type { JsonPatchOp } from "./modification-methods.ts";
import {
	type FetchedSchema,
	type FetchPaths,
	resolveFetchObject,
} from "./select.ts";
import { resolveSubjectSchema } from "./subject.ts";
import { escapeIdiomPath } from "./utils.ts";

/** The underlying SDK subscription returned by `surreal.liveOf()`. */
type SdkLiveSubscription = Awaited<ReturnType<SurrealSession["liveOf"]>>;

/**
 * A single live-query notification: the change `action`, the affected
 * `recordId`, and the `value` (the affected record, parsed against the query's
 * schema — or a JSON Patch array when the query was created with `.diff()`).
 *
 * For `KILLED` notifications the `value` carries no record payload.
 */
export type LiveMessage<T> = {
	action: LiveAction;
	recordId: RecordId;
	value: T;
};

/**
 * A typed wrapper around a SurrealDB live subscription. Obtain one by awaiting a
 * {@link LiveQuery} (e.g. `const sub = await db.live("user")`).
 *
 * Notification values are mapped through the query's schema so handlers and
 * iteration receive fully-typed records.
 */
export class LiveSubscription<T> {
	constructor(
		private readonly inner: SdkLiveSubscription,
		private readonly mapValue: (raw: unknown, action: LiveAction) => T,
	) {}

	/** The id of the underlying live subscription. */
	get id(): Uuid {
		return this.inner.id;
	}

	/**
	 * Subscribe to notifications. Returns a function that unsubscribes this
	 * handler (it does not kill the subscription — use {@link kill} for that).
	 */
	subscribe(handler: (message: LiveMessage<T>) => void): () => void {
		return this.inner.subscribe((message) =>
			handler({
				action: message.action,
				recordId: message.recordId,
				value: this.mapValue(message.value, message.action),
			}),
		);
	}

	/** Async-iterate notifications: `for await (const msg of sub) { … }`. */
	async *[Symbol.asyncIterator](): AsyncIterator<LiveMessage<T>> {
		for await (const message of this.inner) {
			yield {
				action: message.action,
				recordId: message.recordId,
				value: this.mapValue(message.value, message.action),
			};
		}
	}

	/** Kill the live subscription and stop receiving updates. */
	kill(): Promise<void> {
		return this.inner.kill();
	}
}

/**
 * A fluent `LIVE SELECT` query builder. Supports `WHERE`, `FETCH`, return
 * projections via `.return()`, and `.diff()`.
 *
 * Awaiting the builder runs the `LIVE SELECT` and resolves to a typed
 * {@link LiveSubscription}; alternatively call `.subscribe(handler)` to start
 * it and receive a stop function in one step.
 *
 * @remarks
 * `LIVE SELECT` does not support `ORDER BY` / `LIMIT` / `START` / `GROUP` /
 * `SPLIT`. Filtering or projecting (`.where()`, `.return()`, `.fetch()`) relies
 * on query parameters, which require **SurrealDB ≥ 3.0**; on older servers a
 * parameterized live query is accepted but never delivers notifications.
 * Subscriptions are unmanaged and are not automatically restarted on reconnect.
 *
 * @typeParam E - The per-record entry type.
 * @typeParam V - The notification value type (defaults to `E["infer"]`; becomes
 *   `JsonPatchOp[]` after `.diff()`).
 */
export class LiveQuery<
	O extends Orm,
	C extends WorkableContext<O>,
	T extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][T]["schema"],
	V = E["infer"],
> {
	readonly [__ctx]: C;
	private _filter?: Workable<C>;
	private _entry?: Workable<C, E>;
	private _fetch?: string[];
	private _fetchResolvedType?: AbstractType;
	private _diff = false;
	private tb: T | readonly T[];
	private subject: T | RecordId<T> | Workable<C, RecordType<T>>;

	constructor(orm: O, subject: T | RecordId<T> | Workable<C, RecordType<T>>) {
		this[__ctx] = {
			orm,
			id: Symbol(),
		} as C;

		this.subject = subject;

		if (typeof subject === "string") {
			this.tb = subject;
		} else if (isWorkable(subject)) {
			// A polymorphic link (`t.record(["a", "b"])`) carries an array here.
			this.tb = (subject[__type] as RecordType<T>).tb;
		} else {
			this.tb = String((subject as RecordId<T>).table) as T;
		}
	}

	get entry(): E {
		// Mirrors SelectQuery.entry: a return projection defines the result shape
		// and takes precedence over the fetch-resolved schema.
		return (this._entry?.[__type] ??
			this._fetchResolvedType ??
			resolveSubjectSchema(this[__ctx].orm, this.tb)) as E;
	}

	get [__type](): E {
		return this.entry;
	}

	/** Create a shallow clone of this live query. */
	private clone(): this {
		return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
	}

	/**
	 * Return a shallow {@link clone} with `mutate` applied. Mirrors
	 * `Query.derive`: chaining methods derive a new builder instead of mutating
	 * `this`, so a base live query can be safely reused. Mutations must replace
	 * mutable fields wholesale rather than mutating them in place.
	 */
	private derive(mutate: (draft: this) => void): this {
		const next = this.clone();
		mutate(next);
		return next;
	}

	return<
		P extends Inheritable<C>,
		R extends InheritableIntoType<C, P> = InheritableIntoType<C, P>,
	>(cb: (tb: Actionable<C, E>) => P): LiveQuery<O, C, T, R, R["infer"]> {
		const tb = actionable({
			[__ctx]: this[__ctx],
			[__type]: this.entry,
			[__display]: ({ contextId }) => {
				return contextId === this[__ctx].id ? "$this" : "$parent";
			},
		}) as Actionable<C, E>;

		const predicable = cb(tb);
		const workable = inheritableIntoWorkable<C, P>(
			predicable,
		) as unknown as Workable<C, R>;
		const entry = sanitizeWorkable(workable);

		return this.derive((next) => {
			(next as unknown as LiveQuery<O, C, T, R, R["infer"]>)._entry = entry;
		}) as unknown as LiveQuery<O, C, T, R, R["infer"]>;
	}

	where(
		cb: (tb: Actionable<C, O["tables"][T]["schema"]>) => Workable<C>,
	): this {
		const tb = actionable({
			[__ctx]: this[__ctx],
			[__type]: resolveSubjectSchema(this[__ctx].orm, this.tb),
			[__display]: ({ contextId }) => {
				return contextId === this[__ctx].id ? "$this" : "$parent";
			},
		}) as Actionable<C, O["tables"][T]["schema"]>;

		const filter = sanitizeWorkable(cb(tb));
		return this.derive((next) => {
			next._filter = filter;
		});
	}

	fetch<P extends FetchPaths<O, T>>(
		...fields: P[]
	): LiveQuery<
		O,
		C,
		T,
		FetchedSchema<O, E, P>,
		FetchedSchema<O, E, P>["infer"]
	> {
		// Reuse SelectQuery's resolved-schema logic so notification values are
		// validated as the resolved records instead of expecting RecordIds.
		const currentSchema =
			this._entry?.[__type] ?? resolveSubjectSchema(this[__ctx].orm, this.tb);
		const resolved =
			currentSchema instanceof ObjectType
				? resolveFetchObject(currentSchema, fields, this[__ctx].orm)
				: undefined;

		return this.derive((next) => {
			next._fetch = fields;
			if (resolved) next._fetchResolvedType = resolved;
		}) as unknown as LiveQuery<
			O,
			C,
			T,
			FetchedSchema<O, E, P>,
			FetchedSchema<O, E, P>["infer"]
		>;
	}

	/**
	 * Receive updates as JSON Patch arrays (`LIVE SELECT DIFF`) instead of full
	 * records. Mutually exclusive with a `.return()` projection.
	 */
	diff(): LiveQuery<O, C, T, E, JsonPatchOp[]> {
		return this.derive((next) => {
			next._diff = true;
		}) as unknown as LiveQuery<O, C, T, E, JsonPatchOp[]>;
	}

	private displaySubject(ctx: DisplayContext): string {
		if (typeof this.subject === "string")
			return ctx.var(new Table(this.subject));
		if (isWorkable(this.subject)) return this.subject[__display](ctx);
		return ctx.var(this.subject);
	}

	[__display](inp: DisplayContext): string {
		const ctx = displayContext({
			...inp,
			contextId: this[__ctx].id,
		});

		const thing = this.displaySubject(ctx);

		const projection = this._diff
			? "DIFF"
			: this._entry
				? /* surql */ `VALUE ${this._entry[__display](ctx)}`
				: "*";

		let query = /* surql */ `LIVE SELECT ${projection} FROM ${thing}`;

		if (this._filter)
			query += /* surql */ ` WHERE ${this._filter[__display](ctx)}`;

		if (this._fetch && this._fetch.length > 0)
			query += /* surql */ ` FETCH ${this._fetch.map(escapeIdiomPath).join(", ")}`;

		return query;
	}

	/** Render the query as a SurrealQL string. */
	toString(): string {
		const ctx = displayContext();
		return this[__display](ctx);
	}

	/** Start the live query and resolve to a typed {@link LiveSubscription}. */
	async execute(): Promise<LiveSubscription<V>> {
		const ctx = displayContext();
		const query = this[__display](ctx);
		const { surreal } = this[__ctx].orm;

		const [uuid] = await surreal.query<[Uuid]>(query, ctx.variables);
		const inner = await surreal.liveOf(uuid);

		const type = this.entry;
		const diff = this._diff;
		const mapValue = (raw: unknown, action: LiveAction): V => {
			// DIFF yields JSON Patch arrays, and KILLED carries no record payload —
			// pass those through unparsed.
			if (diff || action === "KILLED") return raw as V;
			return type.parse(raw) as V;
		};

		return new LiveSubscription<V>(inner, mapValue);
	}

	/**
	 * Start the live query and subscribe `handler` in one step. Returns a stop
	 * function that unsubscribes the handler and kills the subscription.
	 */
	subscribe(handler: (message: LiveMessage<V>) => void): Promise<() => void> {
		return this.execute().then((sub) => {
			const off = sub.subscribe(handler);
			return () => {
				off();
				void sub.kill();
			};
		});
	}

	// biome-ignore lint/suspicious/noThenProperty: makes the builder awaitable
	then<R1 = LiveSubscription<V>, R2 = never>(
		onFulfilled?:
			| ((value: LiveSubscription<V>) => R1 | PromiseLike<R1>)
			| undefined
			| null,
		onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | undefined | null,
	): Promise<R1 | R2> {
		return this.execute().then(onFulfilled, onRejected);
	}

	catch<R = never>(
		onRejected?: ((reason: unknown) => R | PromiseLike<R>) | undefined | null,
	): Promise<LiveSubscription<V> | R> {
		return this.execute().catch(onRejected);
	}

	finally(
		onFinally?: (() => void) | undefined | null,
	): Promise<LiveSubscription<V>> {
		return this.execute().finally(onFinally);
	}
}
