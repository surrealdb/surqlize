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
	__ctx,
	__display,
	__type,
	isWorkable,
	sanitizeWorkable,
	type Workable,
	type WorkableContext,
} from "../utils/workable.ts";
import { Query } from "./abstract.ts";
import {
	applyContent,
	applyMerge,
	applyPatch,
	applyReplace,
	applySet,
	displayModificationClause,
	type JsonPatchOp,
	type ModificationMode,
	type ModificationState,
	type SetData,
} from "./modification-methods.ts";

/**
 * A fluent RELATE query builder for creating graph edges between records.
 * Supports SET, CONTENT, MERGE, PATCH, REPLACE, RETURN, and TIMEOUT clauses.
 */
export class RelateQuery<
		O extends Orm,
		C extends WorkableContext<O>,
		Edge extends keyof O["tables"] & string,
		E extends AbstractType = O["tables"][Edge]["schema"],
	>
	extends Query<C, ArrayType<E>>
	implements ModificationState
{
	readonly [__ctx]: C;
	_set?: Record<string, unknown>;
	_content?: unknown;
	_merge?: unknown;
	_patch?: JsonPatchOp[];
	_replace?: unknown;
	_modificationMode?: ModificationMode;
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
		return this[__ctx].orm.tables[this.edge]!.schema as unknown as E;
	}

	get [__type](): ArrayType<E> {
		return t.array(this.schema);
	}

	set(data: E extends ObjectType ? Partial<SetData<E>> : never): this {
		applySet(this, data as Record<string, unknown>);
		return this;
	}

	content(
		data: E extends ObjectType
			? Omit<E["infer"], "id" | "in" | "out">
			: E["infer"],
	): this {
		applyContent(this, data);
		return this;
	}

	merge(data: Partial<E["infer"]>): this {
		applyMerge(this, data);
		return this;
	}

	patch(operations: JsonPatchOp[]): this {
		applyPatch(this, operations);
		return this;
	}

	replace(data: Partial<E["infer"]>): this {
		applyReplace(this, data);
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
			this._skipParse = value === "diff";
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

		query += displayModificationClause(this, ctx);

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
