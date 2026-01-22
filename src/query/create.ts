import { type RecordId, Table } from "surrealdb";
import type { Orm } from "../schema/orm.ts";
import {
	type AbstractType,
	type ArrayType,
	type ObjectType,
	t,
} from "../types";
import { type DisplayContext, displayContext } from "../utils/display.ts";
import {
	type Workable,
	type WorkableContext,
	__ctx,
	__display,
	__type,
} from "../utils/workable.ts";
import { Query } from "./abstract.ts";

type SetValue<T extends AbstractType> =
	| T["infer"]
	| { "+=": T["infer"] }
	| { "-=": T["infer"] };

type SetData<T extends ObjectType> = {
	[K in keyof T["schema"]]?: SetValue<T["schema"][K]>;
};

export class CreateQuery<
	O extends Orm,
	C extends WorkableContext<O>,
	T extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][T]["schema"],
> extends Query<C, ArrayType<E>> {
	readonly [__ctx]: C;
	private _set?: Record<string, unknown>;
	private _content?: unknown;
	private _return?: "none" | "before" | "after" | "diff" | Workable<C>;
	private _timeout?: string;
	private _id?: string;

	constructor(
		orm: O,
		readonly tb: T,
		id?: string,
	) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		} as C;
		this._id = id;
	}

	get schema(): E {
		return this[__ctx].orm.tables[this.tb].schema as unknown as E;
	}

	get [__type](): ArrayType<E> {
		return t.array(this.schema);
	}

	set(data: E extends ObjectType ? Partial<SetData<E>> : never): this {
		if (this._content) {
			throw new Error("Cannot use both set() and content() on the same query");
		}

		// Process operators
		const processedData: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(
			data as Record<string, unknown>,
		)) {
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
			throw new Error("Cannot use both content() and set() on the same query");
		}
		this._content = data;
		return this;
	}

	return(mode: "none" | "before" | "after" | "diff"): this;
	return(cb: (record: Workable<C, E>) => Workable<C>): this;
	return(
		value:
			| "none"
			| "before"
			| "after"
			| "diff"
			| ((record: Workable<C, E>) => Workable<C>),
	): this {
		if (typeof value === "function") {
			const record: Workable<C, E> = {
				[__ctx]: this[__ctx],
				[__type]: this.schema,
				[__display]: ({ contextId }) => {
					return contextId === this[__ctx].id ? "$this" : "$parent";
				},
			};
			this._return = value(record);
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

		const table = ctx.var(new Table(this.tb));
		const target = this._id ? `${table}:${ctx.var(this._id)}` : table;

		let query = /* surql */ `CREATE ${target}`;

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
