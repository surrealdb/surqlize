import { type RecordId, Table } from "surrealdb";
import type { Orm } from "../schema/orm.ts";
import {
	type AbstractType,
	type ArrayType,
	type NeverType,
	type OptionType,
	type RecordType,
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
import { Query, type QueryResult } from "./abstract.ts";
import { type WhereObject, whereFromObject } from "./object-filter.ts";
import { resolveSubjectSchema } from "./subject.ts";
import { andWhere } from "./utils.ts";
import type { NoWrite, WriteRow } from "./write-result.ts";

/**
 * The rows a DELETE returns from the stored record. A record can be partial (a
 * write may leave out required fields, see `WriteRow`), and the delete has
 * already committed by the time the row is read. So only the id is guaranteed.
 */
type StoredRow<E extends AbstractType> = WriteRow<E, NoWrite, "update">;

/**
 * Whether a DELETE returns rows. Without a `RETURN` (or with `RETURN NONE`) it
 * returns none: an empty array, or NONE with `.only()`. Any other `RETURN` gives
 * rows.
 */
export type DeleteReturns = "none" | "rows";

/** The result of a DELETE, see {@link DeleteReturns}. */
type DeleteResult<
	E extends AbstractType,
	Only extends boolean,
	Returns extends DeleteReturns,
> = Returns extends "none"
	? Only extends true
		? OptionType<NeverType>
		: ArrayType<NeverType>
	: QueryResult<E, Only>;

/** The `Returns` a `.return()` argument selects: only `none` returns nothing. */
type DeleteReturnsOf<M extends string> = M extends "none" ? "none" : "rows";

/**
 * A fluent DELETE query builder. Supports WHERE, RETURN, and TIMEOUT clauses.
 */
export class DeleteQuery<
	O extends Orm,
	C extends WorkableContext<O>,
	T extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][T]["schema"],
	Only extends boolean = false,
	Returns extends DeleteReturns = "none",
> extends Query<C, DeleteResult<E, Only, Returns>> {
	readonly [__ctx]: C;
	private _only = false;
	private _filter?: Workable<C>;
	private _return?: "none" | "before" | "after" | "diff" | Workable<C, E>;
	private _timeout?: string;
	private tb: T | readonly T[];
	private subject: T | RecordId<T> | Workable<C, RecordType<T>>;

	constructor(orm: O, subject: T | RecordId<T> | Workable<C, RecordType<T>>) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		} as C;
		// The rows a DELETE returns are read after the delete has committed, so
		// they are parsed leniently, as the other write queries are.
		this._lenient = true;

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

	get schema(): E {
		return resolveSubjectSchema(this[__ctx].orm, this.tb) as unknown as E;
	}

	get [__type](): DeleteResult<E, Only, Returns> {
		let type: AbstractType;
		if (this._return === undefined || this._return === "none") {
			type = this._only ? t.option(t.never()) : t.array(t.never());
		} else {
			const schema =
				typeof this._return !== "string" ? this._return[__type] : this.schema;
			type = this._only ? schema : t.array(schema);
		}
		return type as unknown as DeleteResult<E, Only, Returns>;
	}

	only(): DeleteQuery<O, C, T, E, true, Returns> {
		return this.derive((next) => {
			next._only = true;
		}) as DeleteQuery<O, C, T, E, true, Returns>;
	}

	where(cb: (tb: Actionable<C, O["tables"][T]["schema"]>) => Workable<C>): this;
	where(filter: WhereObject<C, O["tables"][T]["schema"]>): this;
	where(
		input:
			| ((tb: Actionable<C, O["tables"][T]["schema"]>) => Workable<C>)
			| WhereObject<C, O["tables"][T]["schema"]>,
	): this {
		const tb = actionable({
			[__ctx]: this[__ctx],
			[__type]: resolveSubjectSchema(this[__ctx].orm, this.tb),
			[__display]: ({ contextId }) => {
				return contextId === this[__ctx].id ? "$this" : "$parent";
			},
		}) as Actionable<C, O["tables"][T]["schema"]>;

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

	/** Return the deleted rows, typed as the stored records (see `StoredRow`). */
	return(
		mode: "before" | "after",
	): DeleteQuery<O, C, T, StoredRow<E>, Only, "rows">;
	return(mode: "none"): DeleteQuery<O, C, T, E, Only, "none">;
	return(mode: "diff"): DeleteQuery<O, C, T, E, Only, "rows">;
	/** A mode chosen at run time: the rows are typed as the broadest of the modes. */
	return<M extends "none" | "before" | "after" | "diff">(
		mode: M,
	): DeleteQuery<O, C, T, StoredRow<E>, Only, DeleteReturnsOf<M>>;
	return<
		P extends Inheritable<C>,
		R extends InheritableIntoType<C, P> = InheritableIntoType<C, P>,
	>(
		cb: (tb: Actionable<C, StoredRow<E>>) => P,
	): DeleteQuery<O, C, T, R, Only, "rows">;
	return(
		value:
			| "none"
			| "before"
			| "after"
			| "diff"
			| ((tb: Actionable<C, StoredRow<E>>) => Inheritable<C>),
	): unknown {
		if (typeof value === "function") {
			// In a DELETE's RETURN VALUE `$this` is NONE, so the deleted record is
			// read as `$before`.
			const tb = actionable({
				[__ctx]: this[__ctx],
				[__type]: this.schema,
				[__display]: ({ contextId }) => {
					return contextId === this[__ctx].id ? "$before" : "$parent";
				},
			}) as Actionable<C, StoredRow<E>>;

			const predicable = value(tb);
			const workable = inheritableIntoWorkable<C, typeof predicable>(
				predicable,
			) as unknown as Workable<C, E>;
			const ret = sanitizeWorkable(workable);
			return this.derive((next) => {
				next._return = ret;
			});
		}
		const mode = value;
		return this.derive((next) => {
			next._return = mode;
			next._skipParse = mode === "diff";
		});
	}

	timeout(duration: string): this {
		return this.derive((next) => {
			next._timeout = duration;
		});
	}

	[__display](inp: DisplayContext) {
		const ctx = displayContext({
			...inp,
			contextId: this[__ctx].id,
		});

		const thing =
			typeof this.subject === "string"
				? ctx.var(new Table(this.subject))
				: isWorkable(this.subject)
					? this.subject[__display](ctx)
					: ctx.var(this.subject);

		let query = /* surql */ `DELETE ${this._only ? "ONLY " : ""}${thing}`;

		if (this._filter)
			query += /* surql */ ` WHERE ${this._filter[__display](ctx)}`;

		if (this._return) {
			if (typeof this._return === "string") {
				query += /* surql */ ` RETURN ${this._return.toUpperCase()}`;
			} else {
				query += /* surql */ ` RETURN VALUE ${this._return[__display](ctx)}`;
			}
		}

		if (this._timeout) {
			query += /* surql */ ` TIMEOUT ${ctx.var(this._timeout)}`;
		}

		return `(${query})`;
	}
}
