import {
	type Expr,
	type LiveAction,
	LiveSubscriptionError,
	type RecordId,
	type LiveMessage as SdkLiveMessage,
	type LiveSubscription as SdkLiveSubscription,
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

/**
 * A single live-query notification.
 *
 * A record change (`CREATE` / `UPDATE` / `DELETE`) carries the affected
 * `recordId` and its `value` (the record, parsed against the query's schema — or
 * a JSON Patch array when the query was created with `.diff()`).
 *
 * `KILLED` signals that the subscription was terminated server-side (for
 * example when its table is removed) and carries neither: there is no record.
 * It is the final message a subscription emits. Modelling this as a union means
 * a handler cannot read `recordId` or `value` on a `KILLED` message without
 * narrowing on `action` first, mirroring the `surrealdb` SDK.
 */
export type LiveMessage<T> =
	| {
			action: Exclude<LiveAction, "KILLED">;
			recordId: RecordId;
			value: T;
	  }
	| {
			action: "KILLED";
			recordId?: undefined;
			value?: undefined;
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
		private readonly inner: SdkLiveSubscription<unknown>,
		private readonly mapValue: (raw: unknown) => T,
	) {}

	/**
	 * The id of the underlying live subscription. A managed subscription is
	 * re-registered when the connection is re-established, which changes its id.
	 */
	get id(): Uuid {
		return this.inner.id;
	}

	/**
	 * Whether the subscription is still delivering notifications. It turns
	 * `false` once the subscription is killed (by {@link kill}, by the server, or
	 * by an aborted request scope) or its session goes away.
	 */
	get isAlive(): boolean {
		return this.inner.isAlive;
	}

	/**
	 * Whether the SDK re-registers this subscription after the connection drops
	 * and reconnects. An unmanaged subscription ends silently instead.
	 */
	get isManaged(): boolean {
		return this.inner.isManaged;
	}

	/**
	 * Subscribe to notifications. Returns a function that unsubscribes this
	 * handler (it does not kill the subscription — use {@link kill} for that).
	 */
	subscribe(handler: (message: LiveMessage<T>) => void): () => void {
		return this.inner.subscribe((message) => handler(this.toMessage(message)));
	}

	/** Async-iterate notifications: `for await (const msg of sub) { … }`. */
	async *[Symbol.asyncIterator](): AsyncIterator<LiveMessage<T>> {
		for await (const message of this.inner) {
			yield this.toMessage(message);
		}
	}

	/** Map an SDK notification onto a {@link LiveMessage}, parsing its value. */
	private toMessage(message: SdkLiveMessage<unknown>): LiveMessage<T> {
		// KILLED carries no record, so there is nothing to parse.
		if (message.action === "KILLED") return { action: "KILLED" };
		return {
			action: message.action,
			recordId: message.recordId,
			value: this.mapValue(message.value),
		};
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
 *
 * A subscription to a table, with any of `.where()`, `.fetch()` and `.diff()`,
 * is **managed** by the SDK: it is registered again when the connection drops
 * and reconnects (its `id` changes), so notifications keep flowing. A
 * `.return()` projection cannot be expressed that way and is **unmanaged**: it
 * goes silent after a reconnect, and `isAlive` stays `true`. Check
 * {@link LiveSubscription.isManaged}.
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

	/**
	 * The table the SDK can subscribe to on our behalf, or `undefined` when this
	 * query needs the unmanaged path.
	 *
	 * The SDK composes a managed `LIVE SELECT` itself, from a table, an optional
	 * `WHERE`, `FETCH` and `DIFF`. It cannot carry a `.return()` projection (an
	 * arbitrary expression), and its resource is a table: a record id or a
	 * subquery as the subject stays on the unmanaged path.
	 */
	private get managedResource(): Table | undefined {
		if (this._entry || typeof this.subject !== "string") return undefined;
		return new Table(this.subject);
	}

	/** The filter as an SDK expression, which defines its own variables. */
	private get managedFilter(): Expr | undefined {
		const filter = this._filter;
		if (!filter) return undefined;
		const contextId = this[__ctx].id;
		return {
			// Rendering only ever defines variables through `var`.
			toSQL: (ctx) =>
				filter[__display]({ var: ctx.def, variables: {}, contextId }),
		};
	}

	/** Register a live query that the SDK keeps alive across reconnects. */
	private async registerManaged(
		resource: Table,
	): Promise<SdkLiveSubscription<unknown>> {
		let live = this[__ctx].orm.surreal.live<unknown>(resource);
		const filter = this.managedFilter;
		if (filter) live = live.where(filter);
		if (this._fetch && this._fetch.length > 0) {
			live = live.fetch(...this._fetch.map(escapeIdiomPath));
		}
		if (this._diff) live = live.diff();

		try {
			return await live;
		} catch (error) {
			// The SDK wraps a failed registration in a `LiveSubscriptionError` whose
			// message ("failed to listen") hides what the server said, such as "the
			// table does not exist". Surface the cause, as the unmanaged path does.
			if (error instanceof LiveSubscriptionError && error.cause !== undefined) {
				throw error.cause;
			}
			throw error;
		}
	}

	/** Register the live query by hand and attach to it, without a restart. */
	private async registerUnmanaged(): Promise<SdkLiveSubscription<unknown>> {
		const ctx = displayContext();
		const query = this[__display](ctx);
		const { surreal } = this[__ctx].orm;

		const [uuid] = await surreal.query<[Uuid]>(query, ctx.variables);
		return surreal.liveOf(uuid);
	}

	/** Start the live query and resolve to a typed {@link LiveSubscription}. */
	async execute(): Promise<LiveSubscription<V>> {
		const resource = this.managedResource;
		const inner = resource
			? await this.registerManaged(resource)
			: await this.registerUnmanaged();

		const type = this.entry;
		const diff = this._diff;
		const mapValue = (raw: unknown): V => {
			// DIFF yields JSON Patch arrays — pass them through unparsed.
			if (diff) return raw as V;
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
				// The subscription is being discarded, so a failure to kill it (for
				// example, the connection is already gone) is not worth an unhandled
				// rejection: the server ends the live query with the connection.
				sub.kill().catch(() => {});
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
