import { type RecordId, Table } from "surrealdb";
import type { Orm } from "../schema/orm.ts";
import {
	type AbstractType,
	type ArrayType,
	type NoneType,
	type UnionType,
	t,
} from "../types";
import { type Actionable, actionable } from "../utils/actionable.ts";
import type { DisplayUtils } from "../utils/display.ts";
import {
	type Predicable,
	type PredicableIntoType,
	predicableIntoWorkable,
} from "../utils/predicable.ts";
import {
	type Workable,
	__display,
	__type,
	sanitizeWorkable,
} from "../utils/workable.ts";
import { Query } from "./abstract.ts";

export class SelectQuery<
	O extends Orm,
	T extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][T]["schema"],
> extends Query<O, ArrayType<E>> {
	private _start?: number;
	private _limit?: number;
	private _filter?: Workable;
	private _entry?: Workable<E>;

	constructor(
		readonly orm: O,
		readonly tb: T,
	) {
		super();
	}

	get entry(): E {
		return (this._entry?.[__type] ?? this.orm.tables[this.tb].schema) as E;
	}

	get [__type](): ArrayType<E> {
		return t.array(this.entry);
	}

	return<
		P extends Predicable,
		R extends PredicableIntoType<P> = PredicableIntoType<P>,
	>(cb: (tb: Actionable<E>) => P): SelectQuery<O, T, R> {
		const tb = actionable({
			[__type]: this.entry,
			[__display]: () => "$this",
		}) as Actionable<E>;

		(this as unknown as SelectQuery<O, T, R>)._entry = sanitizeWorkable(
			predicableIntoWorkable(cb(tb)) as Workable<R>,
		);
		console.log(this._entry);
		console.log(this.entry);
		return this as unknown as SelectQuery<O, T, R>;
	}

	filter(cb: (tb: Actionable<O["tables"][T]["schema"]>) => Workable) {
		const tb = actionable({
			[__type]: this.orm.tables[this.tb].schema,
			[__display]: () => "$this",
		}) as Actionable<O["tables"][T]["schema"]>;

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

	[__display](utils: DisplayUtils) {
		const thing = utils.var(new Table(this.tb));
		const start = this._start && utils.var(this._start);
		const limit = this._limit && utils.var(this._limit);

		const predicates = this._entry
			? /* surql */ `VALUE ${this._entry[__display](utils)}`
			: "*";
		let query = /* surql */ `SELECT ${predicates} FROM $${thing}`;

		if (this._filter)
			query += /* surql */ ` WHERE ${this._filter[__display](utils)}`;

		if (start) query += /* surql */ ` START $${start}`;
		if (limit) query += /* surql */ ` LIMIT $${limit}`;

		return query;
	}
}

export class SelectOneQuery<
	O extends Orm,
	T extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][T]["schema"],
> extends Query<O, UnionType<(E | NoneType)[]>> {
	private _entry?: Workable<E>;

	constructor(
		readonly orm: O,
		readonly rid: RecordId<T>,
	) {
		super();
	}

	get entry(): E {
		return (this._entry?.[__type] ?? this.orm.tables[this.rid.tb].schema) as E;
	}

	get [__type]() {
		return t.union([this.entry, t.none()]);
	}

	[__display](utils: DisplayUtils) {
		const thing = utils.var(this.rid);

		const predicates = this._entry
			? /* surql */ `VALUE ${this._entry[__display](utils)}`
			: "*";

		return /* surql */ `SELECT ${predicates} FROM $${thing}`;
	}

	return<
		P extends Predicable,
		R extends PredicableIntoType<P> = PredicableIntoType<P>,
	>(cb: (tb: Actionable<E>) => P): SelectOneQuery<O, T, R> {
		const tb = actionable({
			[__type]: this.entry,
			[__display]: () => "$this",
		}) as Actionable<E>;

		(this as unknown as SelectOneQuery<O, T, R>)._entry = sanitizeWorkable(
			predicableIntoWorkable(cb(tb)) as Workable<R>,
		);
		console.log(this._entry);
		console.log(this.entry);
		return this as unknown as SelectOneQuery<O, T, R>;
	}
}

const a = t.union([t.string(), t.number()]);
