import { type RecordId, Table } from "surrealdb";
import type { Orm } from "../schema/orm.ts";
import {
	type AbstractType,
	type ArrayType,
	type NoneType,
	type RecordType,
	type UnionType,
	t,
} from "../types";
import { type Actionable, actionable } from "../utils/actionable.ts";
import { type DisplayContext, displayContext } from "../utils/display.ts";
import {
	type Predicable,
	type PredicableIntoType,
	predicableIntoWorkable,
} from "../utils/predicable.ts";
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

export class SelectQuery<
	O extends Orm,
	T extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][T]["schema"],
> extends Query<O, ArrayType<E>> {
	readonly [__ctx]: WorkableContext<O>;
	private _start?: number;
	private _limit?: number;
	private _filter?: Workable;
	private _entry?: Workable<E>;

	constructor(
		orm: O,
		readonly tb: T,
	) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		};
	}

	get entry(): E {
		return (this._entry?.[__type] ??
			this[__ctx].orm.tables[this.tb].schema) as E;
	}

	get [__type](): ArrayType<E> {
		return t.array(this.entry);
	}

	return<
		P extends Predicable,
		R extends PredicableIntoType<P> = PredicableIntoType<P>,
	>(cb: (tb: Actionable<E>) => P): SelectQuery<O, T, R> {
		const tb = actionable({
			[__ctx]: this[__ctx],
			[__type]: this.entry,
			[__display]: ({ contextId }) => {
				console.log(contextId, this[__ctx].id);
				return contextId === this[__ctx].id ? "$this" : "$parent";
			},
		}) as Actionable<E>;

		(this as unknown as SelectQuery<O, T, R>)._entry = sanitizeWorkable(
			predicableIntoWorkable(cb(tb)) as Workable<R>,
		);
		return this as unknown as SelectQuery<O, T, R>;
	}

	filter(cb: (tb: Actionable<O["tables"][T]["schema"]>) => Workable) {
		const tb = actionable({
			[__ctx]: this[__ctx],
			[__type]: this[__ctx].orm.tables[this.tb].schema,
			[__display]: ({ contextId }) => {
				console.log(contextId, this[__ctx].id);
				return contextId === this[__ctx].id ? "$this" : "$parent";
			},
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

	[__display](inp: DisplayContext) {
		const ctx = displayContext({
			...inp,
			contextId: this[__ctx].id,
		});

		const thing = ctx.var(new Table(this.tb));
		const start = this._start && ctx.var(this._start);
		const limit = this._limit && ctx.var(this._limit);

		const predicates = this._entry
			? /* surql */ `VALUE ${this._entry[__display](ctx)}`
			: "*";
		let query = /* surql */ `SELECT ${predicates} FROM ${thing}`;

		if (this._filter)
			query += /* surql */ ` WHERE ${this._filter[__display](ctx)}`;

		if (start) query += /* surql */ ` START ${start}`;
		if (limit) query += /* surql */ ` LIMIT ${limit}`;

		return `(${query})`;
	}
}

export class SelectOneQuery<
	O extends Orm,
	T extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][T]["schema"],
> extends Query<O, UnionType<(E | NoneType)[]>> {
	readonly [__ctx]: WorkableContext<O>;
	private _entry?: Workable<E>;
	private tb: T;

	constructor(
		orm: O,
		readonly subject: RecordId<T> | Workable<RecordType<T>>,
	) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		};

		if (isWorkable(subject)) {
			this.tb = subject[__type].tb;
		} else {
			this.tb = subject.tb;
		}
	}

	get entry(): E {
		return (this._entry?.[__type] ??
			this[__ctx].orm.tables[this.tb].schema) as E;
	}

	get [__type]() {
		return t.union([this.entry, t.none()]);
	}

	[__display](inp: DisplayContext) {
		const ctx = displayContext({
			...inp,
			contextId: this[__ctx].id,
		});

		const thing = isWorkable(this.subject)
			? this.subject[__display](ctx)
			: ctx.var(this.subject);

		const predicates = this._entry
			? /* surql */ `VALUE ${this._entry[__display](ctx)}`
			: "*";

		return /* surql */ `(SELECT ${predicates} FROM ${thing})`;
	}

	return<
		P extends Predicable,
		R extends PredicableIntoType<P> = PredicableIntoType<P>,
	>(cb: (tb: Actionable<E>) => P): SelectOneQuery<O, T, R> {
		const tb = actionable({
			[__ctx]: this[__ctx],
			[__type]: this.entry,
			[__display]: ({ contextId }) => {
				console.log(contextId, this[__ctx].id);
				return contextId === this[__ctx].id ? "$this" : "$parent";
			},
		}) as Actionable<E>;

		(this as unknown as SelectOneQuery<O, T, R>)._entry = sanitizeWorkable(
			predicableIntoWorkable(cb(tb)) as Workable<R>,
		);
		return this as unknown as SelectOneQuery<O, T, R>;
	}
}

const a = t.union([t.string(), t.number()]);
