import { type RecordId, Table } from "surrealdb";
import type { Orm } from "../schema/orm.ts";
import {
	type AbstractType,
	ArrayType,
	ObjectType,
	type ObjectTypeInner,
	OptionType,
	RecordType,
	t,
} from "../types";
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
import { Query } from "./abstract.ts";
import { escapeIdiomPath } from "./utils.ts";

type FieldKeys<O extends Orm, T extends keyof O["tables"] & string> =
	O["tables"][T]["schema"] extends ObjectType<infer F>
		? keyof F & string
		: string;

/**
 * Every valid FETCH path for a table: a top-level field, or a dotted path
 * rooted at a top-level field (e.g. `"out"` or `"out.author"`). Only the head
 * segment is constrained to a known field; deeper segments are unconstrained,
 * mirroring SurrealDB which validates the rest of the path at query time.
 */
export type FetchPaths<O extends Orm, T extends keyof O["tables"] & string> =
	| FieldKeys<O, T>
	| `${FieldKeys<O, T>}.${string}`;

/** The first segment of a dotted path, or the whole path when it has no dot. */
type PathHead<P extends string> = P extends `${infer H}.${string}` ? H : P;

/** The remainder of every path whose head segment is `K`. */
type PathTail<K extends string, P extends string> = P extends `${K}.${infer R}`
	? R
	: never;

/**
 * Resolve a record link to the schema it points at, unwrapping `option<…>` and
 * `array<…>` wrappers. Non-record types (and records to unknown tables) are
 * left untouched.
 */
type ResolveLink<O extends Orm, F extends AbstractType> =
	F extends RecordType<infer Tb>
		? Tb extends keyof O["tables"] & string
			? O["tables"][Tb]["schema"]
			: F
		: F extends OptionType<infer Inner extends AbstractType>
			? OptionType<ResolveLink<O, Inner>>
			: F extends ArrayType<infer Inner extends AbstractType>
				? ArrayType<ResolveLink<O, Inner>>
				: F;

/**
 * Resolve a record link and then continue fetching `Tails` within the resolved
 * object. Used when a fetch path descends past this field (e.g. `out.author`
 * descends through `out`).
 */
type ResolveNested<
	O extends Orm,
	F extends AbstractType,
	Tails extends string,
> =
	F extends RecordType<infer Tb>
		? Tb extends keyof O["tables"] & string
			? FetchedSchema<O, O["tables"][Tb]["schema"], Tails>
			: F
		: F extends OptionType<infer Inner extends AbstractType>
			? OptionType<ResolveNested<O, Inner, Tails>>
			: F extends ArrayType<infer Inner extends AbstractType>
				? ArrayType<ResolveNested<O, Inner, Tails>>
				: F extends ObjectType<ObjectTypeInner>
					? FetchedSchema<O, F, Tails>
					: F;

/** Resolve a single fetched field given the nested paths (if any) beneath it. */
type FetchField<O extends Orm, F extends AbstractType, Tails extends string> = [
	Tails,
] extends [never]
	? ResolveLink<O, F>
	: ResolveNested<O, F, Tails>;

/**
 * Transform an ObjectType by resolving every fetched field. A field is resolved
 * when it is the head of any fetch path; nested paths recurse into the resolved
 * schema. Matches SurrealDB, which expands intermediate records along a path.
 */
export type FetchedSchema<
	O extends Orm,
	E extends AbstractType,
	Paths extends string,
> =
	E extends ObjectType<infer S>
		? ObjectType<{
				[K in keyof S]: K extends PathHead<Paths>
					? FetchField<O, S[K], PathTail<K & string, Paths>>
					: S[K];
			}>
		: E;

/**
 * A fluent SELECT query builder. Supports WHERE, ORDER BY, GROUP BY, SPLIT,
 * FETCH, LIMIT, START, TIMEOUT, and return projections via `.return()`.
 */
export class SelectQuery<
	O extends Orm,
	C extends WorkableContext<O>,
	T extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][T]["schema"],
> extends Query<C, ArrayType<E>> {
	readonly [__ctx]: C;
	private _start?: number;
	private _limit?: number;
	private _filter?: Workable<C>;
	private _entry?: Workable<C, E>;
	private _orderBy?: Array<{
		field: Workable<C> | string;
		direction?: "ASC" | "DESC";
		collate?: boolean;
		numeric?: boolean;
	}>;
	private _groupBy?: string[] | "ALL";
	private _split?: string[];
	private _fetch?: string[];
	private _fetchResolvedType?: AbstractType;
	private _timeout?: string;
	private tb: T;
	private subject: T | RecordId<T> | Workable<C, RecordType<T>>;

	constructor(orm: O, subject: T | RecordId<T> | Workable<C, RecordType<T>>) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		} as C;

		this.subject = subject;

		if (typeof subject === "string") {
			this.tb = subject;
		} else if (isWorkable(subject)) {
			this.tb = subject[__type].tb;
		} else {
			this.tb = String(subject.table) as T;
		}
	}

	get entry(): E {
		// A return projection (`_entry`) defines the query's result shape, so it
		// must take precedence over the fetch-resolved schema when both are set —
		// otherwise parse() would validate the projection against the full table
		// schema and reject it for missing (unprojected) fields. The `.return()`
		// callback still sees the fetch-resolved schema because it reads `entry`
		// *before* assigning `_entry`.
		return (this._entry?.[__type] ??
			this._fetchResolvedType ??
			this[__ctx].orm.tables[this.tb]!.schema) as E;
	}

	get [__type](): ArrayType<E> {
		return t.array(this.entry);
	}

	return<
		P extends Inheritable<C>,
		R extends InheritableIntoType<C, P> = InheritableIntoType<C, P>,
	>(cb: (tb: Actionable<C, E>) => P): SelectQuery<O, C, T, R> {
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
			(next as unknown as SelectQuery<O, C, T, R>)._entry = entry;
		}) as unknown as SelectQuery<O, C, T, R>;
	}

	where(cb: (tb: Actionable<C, O["tables"][T]["schema"]>) => Workable<C>) {
		const tb = actionable({
			[__ctx]: this[__ctx],
			[__type]: this[__ctx].orm.tables[this.tb]!.schema,
			[__display]: ({ contextId }) => {
				return contextId === this[__ctx].id ? "$this" : "$parent";
			},
		}) as Actionable<C, O["tables"][T]["schema"]>;

		const filter = sanitizeWorkable(cb(tb));
		return this.derive((next) => {
			next._filter = filter;
		});
	}

	start(start: number) {
		return this.derive((next) => {
			next._start = start;
		});
	}

	limit(limit: number) {
		return this.derive((next) => {
			next._limit = limit;
		});
	}

	private _addOrderBy(
		field: FieldKeys<O, T> | ((record: Actionable<C, E>) => Workable<C>),
		direction?: "ASC" | "DESC",
		opts?: { collate?: boolean; numeric?: boolean },
	): this {
		const entry =
			typeof field === "string"
				? { field, direction, ...opts }
				: {
						field: sanitizeWorkable(
							field(
								actionable({
									[__ctx]: this[__ctx],
									[__type]: this.entry,
									[__display]: ({ contextId }) => {
										return contextId === this[__ctx].id ? "$this" : "$parent";
									},
								}) as Actionable<C, E>,
							),
						),
						direction,
						...opts,
					};
		return this.derive((next) => {
			next._orderBy = [...(next._orderBy ?? []), entry];
		});
	}

	orderBy(
		field: FieldKeys<O, T> | ((record: Actionable<C, E>) => Workable<C>),
		direction?: "ASC" | "DESC",
	): this {
		return this._addOrderBy(field, direction);
	}

	orderByNumeric(
		field: FieldKeys<O, T> | ((record: Actionable<C, E>) => Workable<C>),
		direction?: "ASC" | "DESC",
	): this {
		return this._addOrderBy(field, direction, { numeric: true });
	}

	orderByCollate(
		field: FieldKeys<O, T> | ((record: Actionable<C, E>) => Workable<C>),
		direction?: "ASC" | "DESC",
	): this {
		return this._addOrderBy(field, direction, { collate: true });
	}

	groupBy(...fields: FieldKeys<O, T>[]): this {
		return this.derive((next) => {
			next._groupBy = fields;
		});
	}

	groupAll(): this {
		return this.derive((next) => {
			next._groupBy = "ALL";
		});
	}

	split(...fields: FieldKeys<O, T>[]): this {
		return this.derive((next) => {
			next._split = fields;
		});
	}

	fetch<P extends FetchPaths<O, T>>(
		...fields: P[]
	): SelectQuery<O, C, T, FetchedSchema<O, E, P>> {
		// Build a resolved schema where fetched record references are replaced
		// with the referenced table's ObjectType schema, recursing into nested
		// paths so parse() validates the resolved objects instead of expecting
		// RecordIds. SurrealDB expands every record along a fetched path, so
		// `out.author` resolves both `out` and its nested `author`.
		const currentSchema =
			this._entry?.[__type] ?? this[__ctx].orm.tables[this.tb]!.schema;
		const resolved =
			currentSchema instanceof ObjectType
				? resolveFetchObject(currentSchema, fields, this[__ctx].orm)
				: undefined;

		return this.derive((next) => {
			next._fetch = fields;
			if (resolved) next._fetchResolvedType = resolved;
		}) as unknown as SelectQuery<O, C, T, FetchedSchema<O, E, P>>;
	}

	timeout(duration: string): this {
		return this.derive((next) => {
			next._timeout = duration;
		});
	}

	private displaySubject(ctx: DisplayContext): string {
		if (typeof this.subject === "string") return ctx.var(new Table(this.tb));
		if (isWorkable(this.subject)) return this.subject[__display](ctx);
		return ctx.var(this.subject);
	}

	private displayOrderBy(ctx: DisplayContext): string {
		if (!this._orderBy || this._orderBy.length === 0) return "";

		const orderParts = this._orderBy.map((spec) => {
			let part =
				typeof spec.field === "string"
					? escapeIdiomPath(spec.field)
					: spec.field[__display](ctx);

			if (spec.collate) part += " COLLATE";
			if (spec.numeric) part += " NUMERIC";
			if (spec.direction) part += ` ${spec.direction}`;

			return part;
		});

		return /* surql */ ` ORDER BY ${orderParts.join(", ")}`;
	}

	[__display](inp: DisplayContext) {
		const ctx = displayContext({
			...inp,
			contextId: this[__ctx].id,
		});

		const thing = this.displaySubject(ctx);
		const start = this._start !== undefined ? ctx.var(this._start) : undefined;
		const limit = this._limit !== undefined ? ctx.var(this._limit) : undefined;

		const predicates = this._entry
			? /* surql */ `VALUE ${this._entry[__display](ctx)}`
			: "*";
		let query = /* surql */ `SELECT ${predicates} FROM ${thing}`;

		if (this._filter)
			query += /* surql */ ` WHERE ${this._filter[__display](ctx)}`;

		if (this._split && this._split.length > 0)
			query += /* surql */ ` SPLIT ${this._split.map(escapeIdiomPath).join(", ")}`;

		if (this._groupBy) {
			query +=
				this._groupBy === "ALL"
					? " GROUP ALL"
					: /* surql */ ` GROUP BY ${this._groupBy.map(escapeIdiomPath).join(", ")}`;
		}

		query += this.displayOrderBy(ctx);

		if (limit) query += /* surql */ ` LIMIT ${limit}`;
		if (start) query += /* surql */ ` START ${start}`;

		if (this._fetch && this._fetch.length > 0)
			query += /* surql */ ` FETCH ${this._fetch.map(escapeIdiomPath).join(", ")}`;

		if (this._timeout)
			query += /* surql */ ` TIMEOUT ${ctx.var(this._timeout)}`;

		return `(${query})`;
	}
}

/**
 * Resolve the fetched fields of an object schema at runtime, mirroring
 * {@link FetchedSchema} at the value level. Fetch paths are grouped by their
 * head segment; each head is resolved once and any deeper segments recurse into
 * the resolved schema.
 */
export function resolveFetchObject(
	schema: ObjectType,
	paths: string[],
	orm: Orm,
): ObjectType {
	// Group paths by head segment, collecting the remaining (nested) paths.
	const tailsByHead = new Map<string, string[]>();
	for (const path of paths) {
		const dot = path.indexOf(".");
		const head = dot === -1 ? path : path.slice(0, dot);
		const tail = dot === -1 ? undefined : path.slice(dot + 1);
		const tails = tailsByHead.get(head) ?? [];
		if (tail !== undefined) tails.push(tail);
		tailsByHead.set(head, tails);
	}

	const resolved: ObjectTypeInner = { ...schema.schema };
	for (const [head, tails] of tailsByHead) {
		const fieldType = resolved[head];
		if (fieldType) resolved[head] = resolveFetchField(fieldType, tails, orm);
	}
	return new ObjectType(resolved);
}

/**
 * Resolve a single fetched field: expand record links (unwrapping `option<…>`
 * and `array<…>`) to the referenced table's schema, then continue resolving any
 * nested paths within it. Unknown or non-record fields are returned unchanged.
 */
function resolveFetchField(
	fieldType: AbstractType,
	tails: string[],
	orm: Orm,
): AbstractType {
	if (fieldType instanceof RecordType && fieldType.tb) {
		const target = orm.tables[fieldType.tb as string];
		if (!target) return fieldType;
		return tails.length === 0
			? target.schema
			: resolveFetchObject(target.schema, tails, orm);
	}
	if (fieldType instanceof OptionType) {
		return new OptionType(resolveFetchField(fieldType.schema, tails, orm));
	}
	if (fieldType instanceof ArrayType && !Array.isArray(fieldType.schema)) {
		return new ArrayType(resolveFetchField(fieldType.schema, tails, orm));
	}
	if (fieldType instanceof ObjectType && tails.length > 0) {
		return resolveFetchObject(fieldType, tails, orm);
	}
	return fieldType;
}
