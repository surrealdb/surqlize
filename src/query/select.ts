import { escapeIdent, type RecordId, Table } from "surrealdb";
import { OrmError } from "../error.ts";
import { ModelType } from "../schema/model-type.ts";
import type { Orm } from "../schema/orm.ts";
import type { RowTraversal } from "../schema/traversal.ts";
import {
	type AbstractType,
	ArrayType,
	type GraphType,
	ObjectType,
	type ObjectTypeInner,
	OptionType,
	RecordType,
	t,
	UnionType,
} from "../types";
import { type Actionable, actionable } from "../utils/actionable.ts";
import { type DisplayContext, displayContext } from "../utils/display.ts";
import {
	type Inheritable,
	type InheritableIntoType,
	type InheritableObject,
	inheritableIntoWorkable,
} from "../utils/inheritable.ts";
import { traversableRow } from "../utils/traversal.ts";
import {
	__ctx,
	__display,
	__fields,
	__type,
	isFieldPath,
	isWorkable,
	sanitizeWorkable,
	type Workable,
	type WorkableContext,
} from "../utils/workable.ts";
import { Query, type QueryResult } from "./abstract.ts";
import {
	type OrderByObject,
	orderFromObject,
	type WhereObject,
	whereFromObject,
} from "./object-filter.ts";
import { type ResolveEntry, resolveSubjectSchema } from "./subject.ts";
import { andWhere, escapeIdiomPath } from "./utils.ts";

type FieldKeys<O extends Orm, T extends keyof O["tables"] & string> =
	O["tables"][T]["schema"] extends ObjectType<infer F>
		? keyof F & string
		: string;

/**
 * The `.extend({ … })` method exposed on the `.return()` row: it projects every
 * field of the row, merged with (and overridden by) the given computed fields,
 * returning a single object projection — see issue #39. `RE` is the row's
 * resolved entry `ObjectType`, so its fields carry through with their declared
 * types and the caller's keys take precedence.
 */
type RowExtend<C extends WorkableContext, RE extends AbstractType> =
	RE extends ObjectType<infer F>
		? {
				extend<Ex extends InheritableObject<C>>(
					extra: Ex,
				): Workable<
					C,
					ObjectType<
						Omit<F, keyof Ex> & {
							[K in keyof Ex]: InheritableIntoType<C, Ex[K]>;
						}
					>
				>;
			}
		: { extend(extra: InheritableObject<C>): Workable<C, ObjectType> };

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
 * The shape of a fetched record whose table is not registered with the ORM: its
 * fields are unknown, so only the `id` is typed.
 */
type UnknownRecord<Tb extends string | undefined> = ObjectType<{
	id: RecordType<Tb>;
}>;

/**
 * Resolve a record link to the schema it points at, unwrapping `option<…>` and
 * `array<…>` wrappers. Non-record types are left untouched; a record to an
 * unregistered table resolves to an {@link UnknownRecord}, as FETCH replaces the
 * link with the record regardless of whether the ORM knows its table.
 */
type ResolveLink<O extends Orm, F extends AbstractType> =
	F extends RecordType<infer Tb>
		? Tb extends keyof O["tables"] & string
			? O["tables"][Tb]["schema"]
			: UnknownRecord<Tb>
		: F extends UnionType<infer Members extends AbstractType[]>
			? UnionType<{
					[K in keyof Members]: Members[K] extends AbstractType
						? ResolveLink<O, Members[K]>
						: never;
				}>
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
			: UnknownRecord<Tb>
		: F extends UnionType<infer Members extends AbstractType[]>
			? UnionType<{
					[K in keyof Members]: Members[K] extends AbstractType
						? ResolveNested<O, Members[K], Tails>
						: never;
				}>
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
	E extends ModelType<infer S, infer I>
		? ModelType<
				{
					[K in keyof S]: K extends PathHead<Paths>
						? FetchField<O, S[K], PathTail<K & string, Paths>>
						: S[K];
				},
				I
			>
		: E extends ObjectType<infer S>
			? ObjectType<{
					[K in keyof S]: K extends PathHead<Paths>
						? FetchField<O, S[K], PathTail<K & string, Paths>>
						: S[K];
				}>
			: E;

/** A sort expression computed in the projection under `alias`. */
type HoistedSort = { alias: string; sql: string };

/** One ORDER BY term. `hoist` marks an expression rather than a field path. */
type OrderSpec<C extends WorkableContext> = {
	field: Workable<C> | string;
	direction?: "ASC" | "DESC";
	collate?: boolean;
	numeric?: boolean;
	/** An expression rather than a field path: sorted through a projected alias. */
	hoist?: boolean;
};

/**
 * The shape of a row after `SPLIT` on the given array fields: each split field
 * holds one element of its array rather than the whole array.
 */
export type SplitEntry<E extends AbstractType, Fields extends string> =
	E extends ModelType<infer S, infer I>
		? ModelType<SplitFields<S, Fields>, I>
		: E extends ObjectType<infer S>
			? ObjectType<SplitFields<S, Fields>>
			: E;

type SplitFields<S, Fields extends string> = {
	[K in keyof S]: K extends Fields
		? S[K] extends ArrayType<infer Item extends AbstractType>
			? Item
			: S[K]
		: S[K];
};

/** The runtime counterpart of {@link SplitEntry}: each split array field becomes its item type. */
function splitSchema(
	schema: AbstractType,
	fields: readonly string[],
): AbstractType {
	if (!(schema instanceof ObjectType) || fields.length === 0) return schema;
	const resolved: ObjectTypeInner = { ...schema.schema };
	for (const field of fields) {
		const type = resolved[field];
		if (type instanceof ArrayType && !Array.isArray(type.schema)) {
			resolved[field] = type.schema;
		}
	}
	return schema instanceof ModelType
		? new ModelType(resolved, schema.model)
		: new ObjectType(resolved);
}

/**
 * A fluent SELECT query builder. Supports WHERE, ORDER BY, GROUP BY, SPLIT,
 * FETCH, LIMIT, START, TIMEOUT, and return projections via `.return()`.
 */
export class SelectQuery<
	O extends Orm,
	C extends WorkableContext<O>,
	T extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][T]["schema"],
	Only extends boolean = false,
> extends Query<C, QueryResult<E, Only>> {
	readonly [__ctx]: C;
	private _only = false;
	private _start?: number;
	private _limit?: number;
	private _filter?: Workable<C>;
	private _entry?: Workable<C, E>;
	/** The fields of an object `.return()` projection, when it is one. */
	private _entryFields?: [string, Workable<C>][];
	private _orderBy?: OrderSpec<C>[];
	private _groupBy?: string[] | "ALL";
	private _split?: string[];
	private _fetch?: string[];
	private _fetchResolvedType?: AbstractType;
	private _timeout?: string;
	private tb: T | readonly T[];
	private subject:
		| T
		| readonly T[]
		| RecordId<T>
		| Workable<C, RecordType<T> | GraphType<T>>;

	constructor(
		orm: O,
		subject:
			| T
			| readonly T[]
			| RecordId<T>
			| Workable<C, RecordType<T> | GraphType<T>>,
	) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		} as C;

		this.subject = subject;

		if (typeof subject === "string") {
			this.tb = subject;
		} else if (Array.isArray(subject)) {
			this.tb = subject;
		} else if (isWorkable(subject)) {
			// A polymorphic link (`t.record(["a", "b"])`) carries an array here; an
			// ordinary link or graph step carries a single table name.
			this.tb = (subject[__type] as RecordType<T> | GraphType<T>).tb;
		} else {
			// `Array.isArray` cannot narrow `readonly T[]` out of the union, so the
			// remaining case (a RecordId) needs an explicit cast.
			this.tb = String((subject as RecordId<T>).table) as T;
		}
	}

	get entry(): E {
		// A return projection (`_entry`) defines the query's result shape, so it
		// must take precedence over the fetch-resolved schema when both are set —
		// otherwise parse() would validate the projection against the full table
		// schema and reject it for missing (unprojected) fields. The `.return()`
		// callback still sees the fetch-resolved schema because it reads `entry`
		// *before* assigning `_entry`.
		if (this._entry) return this._entry[__type] as E;
		// Without a projection, each row is the table's (or fetched) schema, with
		// every SPLIT array field holding a single element.
		const base =
			this._fetchResolvedType ?? resolveSubjectSchema(this[__ctx].orm, this.tb);
		return splitSchema(base, this._split ?? []) as E;
	}

	get [__type](): QueryResult<E, Only> {
		return (this._only ? this.entry : t.array(this.entry)) as QueryResult<
			E,
			Only
		>;
	}

	only(): SelectQuery<O, C, T, E, true> {
		return this.derive((next) => {
			next._only = true;
		}) as SelectQuery<O, C, T, E, true>;
	}

	/**
	 * Build the row actionable handed to `.return()` / `.where()` / `.orderBy()`
	 * callbacks: it renders as `$this` (or `$parent` when nested) and carries the
	 * row's id, so traversal verbs called directly on it root at `<row>.id`.
	 */
	private rowActionable<S extends AbstractType>(type: S): Actionable<C, S> {
		const base = actionable({
			[__ctx]: this[__ctx],
			[__type]: type,
			[__display]: (ctx) => {
				if (ctx.contextId !== this[__ctx].id) return "$parent";
				// A grouped or split SELECT names its row's fields bare: SurrealDB
				// rejects `$this` there.
				return ctx.bareRowsOf === this[__ctx].id ? "" : "$this";
			},
		}) as Actionable<C, S>;
		return traversableRow(
			base,
			resolveSubjectSchema(this[__ctx].orm, this.tb).schema,
		);
	}

	return<
		P extends Inheritable<C>,
		R extends InheritableIntoType<C, P> = InheritableIntoType<C, P>,
	>(
		cb: (
			tb: Actionable<C, ResolveEntry<E>> &
				RowTraversal<C, T> &
				RowExtend<C, ResolveEntry<E>>,
		) => P,
	): SelectQuery<O, C, T, R, Only> {
		const tb = this.rowActionable(this.entry) as Actionable<
			C,
			ResolveEntry<E>
		> &
			RowTraversal<C, T> &
			RowExtend<C, ResolveEntry<E>>;

		const predicable = cb(tb);
		const workable = inheritableIntoWorkable<C, P>(
			predicable,
		) as unknown as Workable<C, R>;
		const entry = sanitizeWorkable(workable);
		const fields = (
			workable as unknown as { [__fields]?: Record<string, Workable<C>> }
		)[__fields];
		const entryFields = fields ? Object.entries(fields) : undefined;

		return this.derive((next) => {
			const select = next as unknown as SelectQuery<O, C, T, R, Only>;
			select._entry = entry;
			select._entryFields = entryFields;
		}) as unknown as SelectQuery<O, C, T, R, Only>;
	}

	/**
	 * Filter rows. Takes either a callback building the condition from the row,
	 * or a plain filter object (`{ name: "x", age: { gt: 18 } }`) that compiles to
	 * the same condition — see {@link WhereObject}. Chained calls AND together;
	 * {@link clearWhere} removes them.
	 */
	where(
		cb: (
			tb: Actionable<C, ResolveEntry<O["tables"][T]["schema"]>> &
				RowTraversal<C, T>,
		) => Workable<C>,
	): this;
	where(filter: WhereObject<C, ResolveEntry<O["tables"][T]["schema"]>>): this;
	where(
		input:
			| ((
					tb: Actionable<C, ResolveEntry<O["tables"][T]["schema"]>> &
						RowTraversal<C, T>,
			  ) => Workable<C>)
			| WhereObject<C, ResolveEntry<O["tables"][T]["schema"]>>,
	): this {
		const tb = this.rowActionable(
			resolveSubjectSchema(this[__ctx].orm, this.tb),
		) as Actionable<C, ResolveEntry<O["tables"][T]["schema"]>> &
			RowTraversal<C, T>;

		const condition =
			typeof input === "function"
				? input(tb)
				: whereFromObject(tb as unknown as Workable<C>, input);
		// An object filter that imposes no condition (such as `where({})`) adds
		// nothing, so the filter already on the query stays.
		if (!condition) return this;

		const filter = sanitizeWorkable(condition as Workable<C>);
		return this.derive((next) => {
			next._filter = andWhere(next._filter, filter);
		});
	}

	/** Remove every `.where()` condition set so far. */
	clearWhere(): this {
		return this.derive((next) => {
			next._filter = undefined;
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
		field:
			| FieldKeys<O, T>
			| ((
					record: Actionable<C, ResolveEntry<E>> & RowTraversal<C, T>,
			  ) => Workable<C>),
		direction?: "ASC" | "DESC",
		opts?: { collate?: boolean; numeric?: boolean },
	): this {
		let entry: OrderSpec<C>;
		if (typeof field === "string") {
			entry = { field, direction, ...opts };
		} else {
			const workable = field(
				this.rowActionable(this.entry) as Actionable<C, ResolveEntry<E>> &
					RowTraversal<C, T>,
			);
			entry = {
				field: sanitizeWorkable(workable),
				direction,
				...opts,
				hoist: !isFieldPath(workable),
			};
		}
		return this.derive((next) => {
			next._orderBy = [...(next._orderBy ?? []), entry];
		});
	}

	/**
	 * Sort rows by a field name, a callback returning a field, or an object of
	 * `{ field: "asc" | "desc" }` pairs (nested objects sort by nested fields) —
	 * see {@link OrderByObject}. Calls accumulate, so object and fluent forms can
	 * be chained.
	 */
	orderBy(
		field:
			| FieldKeys<O, T>
			| ((
					record: Actionable<C, ResolveEntry<E>> & RowTraversal<C, T>,
			  ) => Workable<C>),
		direction?: "ASC" | "DESC",
	): this;
	orderBy(sort: OrderByObject<C, ResolveEntry<E>>): this;
	orderBy(
		field:
			| FieldKeys<O, T>
			| ((
					record: Actionable<C, ResolveEntry<E>> & RowTraversal<C, T>,
			  ) => Workable<C>)
			| OrderByObject<C, ResolveEntry<E>>,
		direction?: "ASC" | "DESC",
	): this {
		if (typeof field === "object" && field !== null) {
			const specs = orderFromObject(
				this.rowActionable(this.entry) as unknown as Workable<C>,
				field,
			);
			return this.derive((next) => {
				next._orderBy = [...(next._orderBy ?? []), ...specs];
			});
		}
		return this._addOrderBy(field, direction);
	}

	orderByNumeric(
		field:
			| FieldKeys<O, T>
			| ((
					record: Actionable<C, ResolveEntry<E>> & RowTraversal<C, T>,
			  ) => Workable<C>),
		direction?: "ASC" | "DESC",
	): this {
		return this._addOrderBy(field, direction, { numeric: true });
	}

	orderByCollate(
		field:
			| FieldKeys<O, T>
			| ((
					record: Actionable<C, ResolveEntry<E>> & RowTraversal<C, T>,
			  ) => Workable<C>),
		direction?: "ASC" | "DESC",
	): this {
		return this._addOrderBy(field, direction, { collate: true });
	}

	/**
	 * Group rows by the given fields. A grouped query must have a `.return()`
	 * projection that selects each of them, and its aggregates, as in
	 * `db.select("post").groupBy("author").return((p) => ({ author: p.author, posts: count(p) }))`.
	 * It cannot be combined with {@link split}.
	 */
	groupBy(...fields: FieldKeys<O, T>[]): this {
		if (fields.length === 0) {
			throw new OrmError("groupBy() needs at least one field");
		}
		this.assertNotSplit("groupBy");
		return this.derive((next) => {
			next._groupBy = fields;
		});
	}

	/**
	 * Group all rows into one, for table-wide aggregates. Needs a `.return()`
	 * projection of aggregates, such as `count(u)` or `math.mean(u.age)`.
	 */
	groupAll(): this {
		this.assertNotSplit("groupAll");
		return this.derive((next) => {
			next._groupBy = "ALL";
		});
	}

	/**
	 * Emit one row per element of the given array fields. SurrealDB does not allow
	 * SPLIT and GROUP BY in the same query, so this cannot be combined with
	 * {@link groupBy} or {@link groupAll}. Call it before {@link return}.
	 */
	split<F extends FieldKeys<O, T>>(
		...fields: F[]
	): SelectQuery<O, C, T, SplitEntry<E, F>, Only> {
		if (this._groupBy !== undefined) {
			throw new OrmError(
				"split() cannot be combined with groupBy() or groupAll(): SurrealDB does not allow SPLIT and GROUP in one query",
			);
		}
		// A projection is typed and parsed from the rows as they were before the
		// split, so a split field inside it would still be typed as the whole array.
		if (this._entry) {
			throw new OrmError(
				"split() must come before return(): the projection was typed before the split",
			);
		}
		return this.derive((next) => {
			next._split = fields;
		}) as unknown as SelectQuery<O, C, T, SplitEntry<E, F>, Only>;
	}

	private assertNotSplit(method: string): void {
		if (this._split && this._split.length > 0) {
			throw new OrmError(
				`${method}() cannot be combined with split(): SurrealDB does not allow SPLIT and GROUP in one query`,
			);
		}
	}

	fetch<P extends FetchPaths<O, T>>(
		...fields: P[]
	): SelectQuery<O, C, T, FetchedSchema<O, E, P>, Only> {
		// Build a resolved schema where fetched record references are replaced
		// with the referenced table's ObjectType schema, recursing into nested
		// paths so parse() validates the resolved objects instead of expecting
		// RecordIds. SurrealDB expands every record along a fetched path, so
		// `out.author` resolves both `out` and its nested `author`.
		const currentSchema =
			this._entry?.[__type] ?? resolveSubjectSchema(this[__ctx].orm, this.tb);
		const resolved =
			currentSchema instanceof ObjectType
				? resolveFetchObject(currentSchema, fields, this[__ctx].orm)
				: undefined;

		return this.derive((next) => {
			next._fetch = fields;
			if (resolved) next._fetchResolvedType = resolved;
		}) as unknown as SelectQuery<O, C, T, FetchedSchema<O, E, P>, Only>;
	}

	timeout(duration: string): this {
		return this.derive((next) => {
			next._timeout = duration;
		});
	}

	private displaySubject(ctx: DisplayContext): string {
		if (typeof this.subject === "string")
			return ctx.var(new Table(this.subject));
		if (Array.isArray(this.subject))
			return this.subject.map((name) => ctx.var(new Table(name))).join(", ");
		if (isWorkable(this.subject)) return this.subject[__display](ctx);
		return ctx.var(this.subject as RecordId<T>);
	}

	/**
	 * The ORDER BY clause. SurrealQL only sorts by field idioms, so an expression
	 * term orders by an alias instead, and its SurrealQL is collected into
	 * `hoisted` for the projection to compute under that alias.
	 */
	private displayOrderBy(ctx: DisplayContext, hoisted: HoistedSort[]): string {
		if (!this._orderBy || this._orderBy.length === 0) return "";

		const orderParts = this._orderBy.map((spec) => {
			let part: string;
			if (typeof spec.field === "string") {
				part = escapeIdiomPath(spec.field);
			} else if (spec.hoist) {
				const alias = `__order_${hoisted.length}`;
				hoisted.push({ alias, sql: spec.field[__display](ctx) });
				part = alias;
			} else {
				part = spec.field[__display](ctx);
			}

			if (spec.collate) part += " COLLATE";
			if (spec.numeric) part += " NUMERIC";
			if (spec.direction) part += ` ${spec.direction}`;

			return part;
		});

		return /* surql */ ` ORDER BY ${orderParts.join(", ")}`;
	}

	/**
	 * The projection after `SELECT`. An expression sort is computed beside `*`
	 * under its alias and dropped again with OMIT, so it cannot be combined with a
	 * return() projection (a VALUE projection has no OMIT to drop the alias from) or
	 * with a grouped query (SurrealDB needs the sort key to be a selected field).
	 *
	 * A grouped or split query has to name its keys as selected fields, which an
	 * object `VALUE { … }` cannot do, so its object projection is a field list
	 * (`email AS writer, count(true) AS posts`). SurrealDB rejects a grouped query
	 * with no projection, and one that does not select each of its keys, so both
	 * are reported here as an {@link OrmError}.
	 */
	private displayProjection(
		ctx: DisplayContext,
		bare: boolean,
		hoisted: HoistedSort[],
	): string {
		this.assertHoistedSortAllowed(hoisted);
		if (!this._entry) return this.displayUnprojected(hoisted);
		const fields = this._entryFields;
		if (!bare) return /* surql */ `VALUE ${this._entry[__display](ctx)}`;

		const exprs = fields
			? fields.map(([, field]) => field[__display](ctx))
			: [this._entry[__display](ctx)];

		const keys =
			this._groupBy === "ALL" ? [] : (this._groupBy ?? this._split ?? []);
		const kind = this._groupBy !== undefined ? "groupBy" : "split";
		for (const key of keys) {
			if (!exprs.includes(escapeIdiomPath(key))) {
				throw new OrmError(
					`${kind}("${key}") needs the return() projection to select "${key}" as a field`,
				);
			}
		}

		if (!fields) return /* surql */ `VALUE ${exprs[0]}`;
		return fields
			.map(([alias], i) => `${exprs[i]} AS ${escapeIdent(alias)}`)
			.join(", ");
	}

	/** An expression sort is hoisted into a `*` projection, so it cannot be combined with a return() or a grouped query. */
	private assertHoistedSortAllowed(hoisted: HoistedSort[]): void {
		if (hoisted.length === 0) return;
		if (this._groupBy !== undefined) {
			throw new OrmError(
				"orderBy() with an expression cannot be combined with groupBy() or groupAll(): the sort key must be a selected field. Sort by a field, or by a name the return() projection selects.",
			);
		}
		if (this._entry) {
			throw new OrmError(
				"orderBy() with an expression cannot be combined with return(): the sort key would be returned with each row. Sort by a field, or return the value and sort in your code.",
			);
		}
	}

	/** The projection of a query with no return(): `*`, with any hoisted sort keys beside it. */
	private displayUnprojected(hoisted: HoistedSort[]): string {
		if (this._groupBy !== undefined) {
			throw new OrmError(
				"groupBy() and groupAll() need a return() projection of aggregates: SurrealDB cannot group SELECT *",
			);
		}
		if (hoisted.length === 0) return "*";
		const sorts = hoisted.map((h) => `${h.sql} AS ${h.alias}`).join(", ");
		const aliases = hoisted.map((h) => h.alias).join(", ");
		return `*, ${sorts} OMIT ${aliases}`;
	}

	/** The SPLIT and GROUP clauses, which come after WHERE and before ORDER BY. */
	private displayGrouping(): string {
		let clauses = "";
		if (this._split && this._split.length > 0)
			clauses += /* surql */ ` SPLIT ${this._split.map(escapeIdiomPath).join(", ")}`;

		if (this._groupBy) {
			clauses +=
				this._groupBy === "ALL"
					? " GROUP ALL"
					: /* surql */ ` GROUP BY ${this._groupBy.map(escapeIdiomPath).join(", ")}`;
		}
		return clauses;
	}

	[__display](inp: DisplayContext) {
		const grouped = this._groupBy !== undefined;
		const split = this._split !== undefined && this._split.length > 0;
		const ctx = displayContext({
			...inp,
			contextId: this[__ctx].id,
			bareRowsOf: grouped || split ? this[__ctx].id : undefined,
		});

		const thing = this.displaySubject(ctx);
		const start = this._start !== undefined ? ctx.var(this._start) : undefined;
		const limit = this._limit !== undefined ? ctx.var(this._limit) : undefined;

		const hoisted: HoistedSort[] = [];
		const orderBy = this.displayOrderBy(ctx, hoisted);

		const predicates = this.displayProjection(ctx, grouped || split, hoisted);
		let query = /* surql */ `SELECT ${predicates} FROM ${this._only ? "ONLY " : ""}${thing}`;

		if (this._filter)
			query += /* surql */ ` WHERE ${this._filter[__display](ctx)}`;

		query += this.displayGrouping();
		query += orderBy;

		if (limit) query += /* surql */ ` LIMIT ${limit}`;
		if (start) query += /* surql */ ` START ${start}`;

		if (this._fetch && this._fetch.length > 0)
			query += /* surql */ ` FETCH ${this._fetch.map(escapeIdiomPath).join(", ")}`;

		// SELECT's TIMEOUT rejects a bound string ("Invalid timeout value"), though
		// UPDATE, CREATE and the others accept it. The cast makes the parameter a
		// duration on every supported server version (3.0.5 to 3.3.0).
		if (this._timeout)
			query += /* surql */ ` TIMEOUT <duration> ${ctx.var(this._timeout)}`;

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
	return schema instanceof ModelType
		? new ModelType(resolved, schema.model)
		: new ObjectType(resolved);
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
	if (fieldType instanceof RecordType) {
		return resolveFetchRecord(fieldType, tails, orm);
	}
	if (fieldType instanceof UnionType) {
		return new UnionType(
			fieldType.schema.map((member: AbstractType) =>
				resolveFetchField(member, tails, orm),
			),
		);
	}
	if (fieldType instanceof OptionType) {
		return new OptionType(resolveFetchField(fieldType.schema, tails, orm));
	}
	if (fieldType instanceof ArrayType) {
		return resolveFetchArray(fieldType, tails, orm);
	}
	if (fieldType instanceof ObjectType && tails.length > 0) {
		return resolveFetchObject(fieldType, tails, orm);
	}
	return fieldType;
}

function resolveFetchRecord(
	fieldType: RecordType,
	tails: string[],
	orm: Orm,
): AbstractType {
	const tb = fieldType.tb;

	if (typeof tb === "string") {
		return resolveFetchTable(tb, tails, orm);
	}

	if (!Array.isArray(tb)) return fieldType;

	return new UnionType(tb.map((table) => resolveFetchTable(table, tails, orm)));
}

/**
 * The schema of a record fetched from `tb`. A table the ORM does not know has no
 * declared fields, so it resolves to an object that only types its `id`.
 */
function resolveFetchTable(
	tb: string,
	tails: string[],
	orm: Orm,
): AbstractType {
	const target = orm.tables[tb];
	if (!target) return new ObjectType({ id: new RecordType(tb) });
	return tails.length === 0
		? target.schema
		: resolveFetchObject(target.schema, tails, orm);
}

function resolveFetchArray(
	fieldType: ArrayType,
	tails: string[],
	orm: Orm,
): AbstractType {
	if (Array.isArray(fieldType.schema)) return fieldType;
	return new ArrayType(resolveFetchField(fieldType.schema, tails, orm));
}
