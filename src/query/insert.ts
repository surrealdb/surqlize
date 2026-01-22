import { Table } from "surrealdb";
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

export class InsertQuery<
	O extends Orm,
	C extends WorkableContext<O>,
	T extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][T]["schema"],
> extends Query<C, ArrayType<E>> {
	readonly [__ctx]: C;
	private _data?: unknown | unknown[];
	private _fields?: string[];
	private _values?: unknown[][];
	private _ignore?: boolean;
	private _onDuplicate?: Record<string, unknown>;
	private _return?: "none" | "before" | "after" | "diff" | Workable<C, E>;
	private _timeout?: string;

	constructor(
		orm: O,
		readonly tb: T,
		data?: unknown | unknown[],
	) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		} as C;
		this._data = data;
	}

	get schema(): E {
		return this[__ctx].orm.tables[this.tb].schema as unknown as E;
	}

	get [__type](): ArrayType<E> {
		return t.array(this.schema);
	}

	fields(
		fields: E extends ObjectType ? (keyof E["schema"])[] : string[],
	): this {
		if (this._data) {
			throw new Error("Cannot use fields() with object-style insert");
		}
		this._fields = fields as string[];
		return this;
	}

	values(...rows: unknown[][]): this {
		if (this._data) {
			throw new Error("Cannot use values() with object-style insert");
		}
		if (!this._fields) {
			throw new Error("Must call fields() before values()");
		}

		// Validate each row has the correct number of values
		for (const row of rows) {
			if (row.length !== this._fields.length) {
				throw new Error(
					`Value row length (${row.length}) does not match fields length (${this._fields.length})`,
				);
			}
		}

		this._values = [...(this._values || []), ...rows];
		return this;
	}

	ignore(): this {
		if (this._onDuplicate) {
			throw new Error("Cannot use both ignore() and onDuplicate()");
		}
		this._ignore = true;
		return this;
	}

	onDuplicate(
		updates: E extends ObjectType
			? Partial<SetData<E>>
			: Record<string, unknown>,
	): this {
		if (this._ignore) {
			throw new Error("Cannot use both ignore() and onDuplicate()");
		}

		const processedData = processSetOperators(
			updates as Record<string, unknown>,
		);
		this._onDuplicate = processedData;
		return this;
	}

	return(mode: "none" | "before" | "after" | "diff"): this;
	return<
		P extends Inheritable<C>,
		R extends InheritableIntoType<C, P> = InheritableIntoType<C, P>,
	>(cb: (tb: Actionable<C, E>) => P): InsertQuery<O, C, T, R>;
	return(
		value:
			| "none"
			| "before"
			| "after"
			| "diff"
			| ((tb: Actionable<C, E>) => Inheritable<C>),
	): this {
		if (typeof value === "function") {
			const tb = actionable({
				[__ctx]: this[__ctx],
				[__type]: this.schema,
				[__display]: ({ contextId }) => {
					return contextId === this[__ctx].id ? "$this" : "$parent";
				},
			}) as Actionable<C, E>;

			const predicable = value(tb);
			const workable = inheritableIntoWorkable<C, typeof predicable>(
				predicable,
			) as unknown as Workable<C, E>;
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

		const table = ctx.var(new Table(this.tb));

		let query = /* surql */ "INSERT";
		if (this._ignore) query += /* surql */ " IGNORE";
		query += /* surql */ ` INTO ${table}`;

		// Object-style syntax
		if (this._data) {
			query += /* surql */ ` ${ctx.var(this._data)}`;
		}

		// VALUES tuple syntax
		else if (this._fields && this._values) {
			query += /* surql */ ` (${this._fields.join(", ")})`;
			const valueGroups = this._values.map(
				(row) => `(${row.map((v) => ctx.var(v)).join(", ")})`,
			);
			query += /* surql */ ` VALUES ${valueGroups.join(", ")}`;
		}

		// ON DUPLICATE KEY UPDATE
		if (this._onDuplicate) {
			const assignments = generateSetAssignments(this._onDuplicate, ctx);
			query += /* surql */ ` ON DUPLICATE KEY UPDATE ${assignments.join(", ")}`;
		}

		// RETURN clause
		if (this._return) {
			if (typeof this._return === "string") {
				query += /* surql */ ` RETURN ${this._return.toUpperCase()}`;
			} else {
				query += /* surql */ ` RETURN ${this._return[__display](ctx)}`;
			}
		}

		// TIMEOUT
		if (this._timeout) {
			query += /* surql */ ` TIMEOUT ${ctx.var(this._timeout)}`;
		}

		return `(${query})`;
	}
}
