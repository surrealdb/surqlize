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

type SetValue<T extends AbstractType> =
	| T["infer"]
	| { "+=": T["infer"] }
	| { "-=": T["infer"] };

type SetData<T extends ObjectType> = {
	[K in keyof T["schema"]]?: SetValue<T["schema"][K]>;
};

export class RelateQuery<
	O extends Orm,
	C extends WorkableContext<O>,
	Edge extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][Edge]["schema"],
> extends Query<C, ArrayType<E>> {
	readonly [__ctx]: C;
	private _set?: Record<string, unknown>;
	private _content?: unknown;
	private _return?: "none" | "before" | "after" | "diff" | Workable<C, E>;
	private _timeout?: string;

	constructor(
		orm: O,
		readonly edge: Edge,
		readonly from:
			| RecordId[]
			| Workable<C, ArrayType<RecordType>>
			| RecordId
			| Workable<C, RecordType>,
		readonly to:
			| RecordId[]
			| Workable<C, ArrayType<RecordType>>
			| RecordId
			| Workable<C, RecordType>,
	) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		} as C;
	}

	get schema(): E {
		return this[__ctx].orm.tables[this.edge].schema as E;
	}

	get [__type](): ArrayType<E> {
		return t.array(this.schema);
	}

	set(data: E extends ObjectType ? Partial<SetData<E>> : never): this {
		if (this._content) {
			throw new Error(
				"Cannot use both set() and content() on the same query",
			);
		}

		// Process operators
		const processedData: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
			if (
				value &&
				typeof value === "object" &&
				("+=" in value || "-=" in value)
			) {
				processedData[key] = value;
			} else {
				processedData[key] = value;
			}
		}

		this._set = { ...this._set, ...processedData };
		return this;
	}

	content(data: E["infer"]): this {
		if (this._set) {
			throw new Error(
				"Cannot use both content() and set() on the same query",
			);
		}
		this._content = data;
		return this;
	}

	return(mode: "none" | "before" | "after" | "diff"): this;
	return(
		cb: (record: Actionable<C, E>) => Inheritable<C>,
	): RelateQuery<O, C, Edge, InheritableIntoType<C, ReturnType<typeof cb>>>;
	return(
		value:
			| "none"
			| "before"
			| "after"
			| "diff"
			| ((record: Actionable<C, E>) => Inheritable<C>),
	): this {
		if (typeof value === "function") {
			const record = actionable({
				[__ctx]: this[__ctx],
				[__type]: this.schema,
				[__display]: ({ contextId }) => {
					return contextId === this[__ctx].id ? "$this" : "$parent";
				},
			}) as Actionable<C, E>;

			const inheritable = value(record);
			const workable = inheritableIntoWorkable(inheritable) as Workable<C, E>;
			this._return = sanitizeWorkable(workable);
		} else {
			this._return = value;
		}
		return this;
	}

	timeout(duration: string): this {
		this._timeout = duration;
		return this;
	}

	[__display](inp: DisplayContext) {
		const ctx = displayContext({
			...inp,
			contextId: this[__ctx].id,
		});

		const edgeTable = ctx.var(new Table(this.edge));

		// Format sources
		let fromStr: string;
		if (Array.isArray(this.from)) {
			const fromIds = this.from.map((id) => ctx.var(id));
			fromStr = `[${fromIds.join(", ")}]`;
		} else if (isWorkable(this.from)) {
			fromStr = this.from[__display](ctx);
		} else {
			fromStr = ctx.var(this.from);
		}

		// Format targets
		let toStr: string;
		if (Array.isArray(this.to)) {
			const toIds = this.to.map((id) => ctx.var(id));
			toStr = `[${toIds.join(", ")}]`;
		} else if (isWorkable(this.to)) {
			toStr = this.to[__display](ctx);
		} else {
			toStr = ctx.var(this.to);
		}

		let query = /* surql */ `RELATE ${fromStr}->${edgeTable}->${toStr}`;

		if (this._content) {
			query += /* surql */ ` CONTENT ${ctx.var(this._content)}`;
		} else if (this._set) {
			const assignments: string[] = [];
			for (const [key, value] of Object.entries(this._set)) {
				if (value && typeof value === "object" && "+=" in value) {
					assignments.push(
						`${key} += ${ctx.var((value as { "+=": unknown })["+="])}`,
					);
				} else if (value && typeof value === "object" && "-=" in value) {
					assignments.push(
						`${key} -= ${ctx.var((value as { "-=": unknown })["-="])}`,
					);
				} else {
					assignments.push(`${key} = ${ctx.var(value)}`);
				}
			}
			query += /* surql */ ` SET ${assignments.join(", ")}`;
		}

		if (this._return) {
			if (typeof this._return === "string") {
				query += /* surql */ ` RETURN ${this._return.toUpperCase()}`;
			} else {
				query += /* surql */ ` RETURN ${this._return[__display](ctx)}`;
			}
		}

		if (this._timeout) {
			query += /* surql */ ` TIMEOUT ${ctx.var(this._timeout)}`;
		}

		return `(${query})`;
	}
}

export class RelateOneQuery<
	O extends Orm,
	C extends WorkableContext<O>,
	Edge extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][Edge]["schema"],
> extends Query<C, E> {
	readonly [__ctx]: C;
	private _set?: Record<string, unknown>;
	private _content?: unknown;
	private _return?: "none" | "before" | "after" | "diff" | Workable<C, E>;
	private _timeout?: string;

	constructor(
		orm: O,
		readonly edge: Edge,
		readonly from: RecordId | Workable<C, RecordType>,
		readonly to: RecordId | Workable<C, RecordType>,
	) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		} as C;
	}

	get schema(): E {
		return this[__ctx].orm.tables[this.edge].schema as E;
	}

	get [__type](): E {
		return this.schema;
	}

	set(data: E extends ObjectType ? Partial<SetData<E>> : never): this {
		if (this._content) {
			throw new Error(
				"Cannot use both set() and content() on the same query",
			);
		}

		// Process operators
		const processedData: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
			if (
				value &&
				typeof value === "object" &&
				("+=" in value || "-=" in value)
			) {
				processedData[key] = value;
			} else {
				processedData[key] = value;
			}
		}

		this._set = { ...this._set, ...processedData };
		return this;
	}

	content(data: E["infer"]): this {
		if (this._set) {
			throw new Error(
				"Cannot use both content() and set() on the same query",
			);
		}
		this._content = data;
		return this;
	}

	return(mode: "none" | "before" | "after" | "diff"): this;
	return(
		cb: (record: Actionable<C, E>) => Inheritable<C>,
	): RelateOneQuery<O, C, Edge, InheritableIntoType<C, ReturnType<typeof cb>>>;
	return(
		value:
			| "none"
			| "before"
			| "after"
			| "diff"
			| ((record: Actionable<C, E>) => Inheritable<C>),
	): this {
		if (typeof value === "function") {
			const record = actionable({
				[__ctx]: this[__ctx],
				[__type]: this.schema,
				[__display]: ({ contextId }) => {
					return contextId === this[__ctx].id ? "$this" : "$parent";
				},
			}) as Actionable<C, E>;

			const inheritable = value(record);
			const workable = inheritableIntoWorkable(inheritable) as Workable<C, E>;
			this._return = sanitizeWorkable(workable);
		} else {
			this._return = value;
		}
		return this;
	}

	timeout(duration: string): this {
		this._timeout = duration;
		return this;
	}

	[__display](inp: DisplayContext) {
		const ctx = displayContext({
			...inp,
			contextId: this[__ctx].id,
		});

		const edgeTable = ctx.var(new Table(this.edge));

		// Format source
		const fromStr = isWorkable(this.from)
			? this.from[__display](ctx)
			: ctx.var(this.from);

		// Format target
		const toStr = isWorkable(this.to)
			? this.to[__display](ctx)
			: ctx.var(this.to);

		let query = /* surql */ `RELATE ${fromStr}->${edgeTable}->${toStr}`;

		if (this._content) {
			query += /* surql */ ` CONTENT ${ctx.var(this._content)}`;
		} else if (this._set) {
			const assignments: string[] = [];
			for (const [key, value] of Object.entries(this._set)) {
				if (value && typeof value === "object" && "+=" in value) {
					assignments.push(
						`${key} += ${ctx.var((value as { "+=": unknown })["+="])}`,
					);
				} else if (value && typeof value === "object" && "-=" in value) {
					assignments.push(
						`${key} -= ${ctx.var((value as { "-=": unknown })["-="])}`,
					);
				} else {
					assignments.push(`${key} = ${ctx.var(value)}`);
				}
			}
			query += /* surql */ ` SET ${assignments.join(", ")}`;
		}

		if (this._return) {
			if (typeof this._return === "string") {
				query += /* surql */ ` RETURN ${this._return.toUpperCase()}`;
			} else {
				query += /* surql */ ` RETURN ${this._return[__display](ctx)}`;
			}
		}

		if (this._timeout) {
			query += /* surql */ ` TIMEOUT ${ctx.var(this._timeout)}`;
		}

		return `(${query})`;
	}
}
