import { RecordId, Table } from "surrealdb";
import type { Orm } from "../schema/orm.ts";
import {
	type AbstractType,
	type ArrayType,
	type ObjectType,
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
	sanitizeWorkable,
} from "../utils/workable.ts";
import { Query } from "./abstract.ts";
import {
	type SetValue,
	generateSetAssignments,
	processSetOperators,
} from "./utils.ts";

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

		const processedData = processSetOperators(data as Record<string, unknown>);
		this._set = { ...this._set, ...processedData };
		return this;
	}

	content(
		data: E extends ObjectType ? Omit<E["infer"], "id"> : E["infer"],
	): this {
		if (this._set) {
			throw new Error("Cannot use both content() and set() on the same query");
		}
		this._content = data;
		return this;
	}

	return(mode: "none" | "before" | "after" | "diff"): this;
	return(
		cb: (record: Actionable<C, E>) => Inheritable<C>,
	): CreateQuery<O, C, T, InheritableIntoType<C, ReturnType<typeof cb>>>;
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
			const workable = inheritableIntoWorkable(inheritable);
			this._return = sanitizeWorkable(workable) as Workable<C>;
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

		let target: string;
		if (this._id) {
			// Create a RecordId for the target instead of concatenating variables
			const recordId = new RecordId(this.tb, this._id);
			target = ctx.var(recordId);
		} else {
			target = ctx.var(new Table(this.tb));
		}

		let query = /* surql */ `CREATE ${target}`;

		if (this._content) {
			query += /* surql */ ` CONTENT ${ctx.var(this._content)}`;
		} else if (this._set) {
			const assignments = generateSetAssignments(this._set, ctx);
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
