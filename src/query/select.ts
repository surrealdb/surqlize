import { type RecordId, Table } from "surrealdb";
import type { Orm } from "../schema/orm.ts";
import {
	type AbstractType,
	type ArrayType,
	type ObjectType,
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
	type Workable,
	type WorkableContext,
	__ctx,
	__display,
	__type,
	isWorkable,
	sanitizeWorkable,
} from "../utils/workable.ts";
import { Query } from "./abstract.ts";

type FieldKeys<
	O extends Orm,
	T extends keyof O["tables"] & string,
> = O["tables"][T]["schema"] extends ObjectType<infer F>
	? keyof F & string
	: string;

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
		return (this._entry?.[__type] ??
			this[__ctx].orm.tables[this.tb].schema) as E;
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

		(this as unknown as SelectQuery<O, C, T, R>)._entry = entry;
		return this as unknown as SelectQuery<O, C, T, R>;
	}

	where(cb: (tb: Actionable<C, O["tables"][T]["schema"]>) => Workable<C>) {
		const tb = actionable({
			[__ctx]: this[__ctx],
			[__type]: this[__ctx].orm.tables[this.tb].schema,
			[__display]: ({ contextId }) => {
				return contextId === this[__ctx].id ? "$this" : "$parent";
			},
		}) as Actionable<C, O["tables"][T]["schema"]>;

		this._filter = sanitizeWorkable(cb(tb));
		return this;
	}

	start(start: number) {
		this._start = start;
		return this;
	}

	limit(limit: number) {
		this._limit = limit;
		return this;
	}

	private _addOrderBy(
		field: FieldKeys<O, T> | ((record: Actionable<C, E>) => Workable<C>),
		direction?: "ASC" | "DESC",
		opts?: { collate?: boolean; numeric?: boolean },
	): this {
		if (!this._orderBy) this._orderBy = [];
		if (typeof field === "string") {
			this._orderBy.push({ field, direction, ...opts });
		} else {
			const record = actionable({
				[__ctx]: this[__ctx],
				[__type]: this.entry,
				[__display]: ({ contextId }) => {
					return contextId === this[__ctx].id ? "$this" : "$parent";
				},
			}) as Actionable<C, E>;
			this._orderBy.push({
				field: sanitizeWorkable(field(record)),
				direction,
				...opts,
			});
		}
		return this;
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
		this._groupBy = fields;
		return this;
	}

	groupAll(): this {
		this._groupBy = "ALL";
		return this;
	}

	split(...fields: FieldKeys<O, T>[]): this {
		this._split = fields;
		return this;
	}

	fetch(...fields: (FieldKeys<O, T> | `${FieldKeys<O, T>}.${string}`)[]): this {
		this._fetch = fields;
		return this;
	}

	timeout(duration: string): this {
		this._timeout = duration;
		return this;
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
					? spec.field
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
		const start = this._start && ctx.var(this._start);
		const limit = this._limit && ctx.var(this._limit);

		const predicates = this._entry
			? /* surql */ `VALUE ${this._entry[__display](ctx)}`
			: "*";
		let query = /* surql */ `SELECT ${predicates} FROM ${thing}`;

		if (this._filter)
			query += /* surql */ ` WHERE ${this._filter[__display](ctx)}`;

		if (this._split && this._split.length > 0)
			query += /* surql */ ` SPLIT ${this._split.join(", ")}`;

		if (this._groupBy) {
			query +=
				this._groupBy === "ALL"
					? " GROUP ALL"
					: /* surql */ ` GROUP BY ${this._groupBy.join(", ")}`;
		}

		query += this.displayOrderBy(ctx);

		if (limit) query += /* surql */ ` LIMIT ${limit}`;
		if (start) query += /* surql */ ` START ${start}`;

		if (this._fetch && this._fetch.length > 0)
			query += /* surql */ ` FETCH ${this._fetch.join(", ")}`;

		if (this._timeout)
			query += /* surql */ ` TIMEOUT ${ctx.var(this._timeout)}`;

		return `(${query})`;
	}
}
