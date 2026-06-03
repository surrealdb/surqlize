import { RecordId, type RecordIdValue, Table } from "surrealdb";
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
	__ctx,
	__display,
	__type,
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
 * A fluent CREATE query builder. Supports SET, CONTENT, MERGE, PATCH, REPLACE,
 * RETURN, and TIMEOUT clauses.
 */
export class CreateQuery<
		O extends Orm,
		C extends WorkableContext<O>,
		T extends keyof O["tables"] & string,
		E extends AbstractType = O["tables"][T]["schema"],
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
	private _return?: "none" | "before" | "after" | "diff" | Workable<C>;
	private _timeout?: string;
	private _id?: RecordIdValue;

	constructor(
		orm: O,
		readonly tb: T,
		id?: RecordIdValue,
	) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		} as C;
		this._id = id;
	}

	get schema(): E {
		return this[__ctx].orm.tables[this.tb]!.schema as unknown as E;
	}

	get [__type](): ArrayType<E> {
		if (this._return && typeof this._return !== "string") {
			return t.array(this._return[__type]) as ArrayType<E>;
		}
		return t.array(this.schema);
	}

	set(data: E extends ObjectType ? Partial<SetData<E>> : never): this {
		return this.derive((next) =>
			applySet(next, data as Record<string, unknown>),
		);
	}

	content(
		data: E extends ObjectType ? Omit<E["infer"], "id"> : E["infer"],
	): this {
		return this.derive((next) => applyContent(next, data));
	}

	merge(data: Partial<E["infer"]>): this {
		return this.derive((next) => applyMerge(next, data));
	}

	patch(operations: JsonPatchOp[]): this {
		return this.derive((next) => applyPatch(next, operations));
	}

	replace(data: Partial<E["infer"]>): this {
		return this.derive((next) => applyReplace(next, data));
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
			const ret = sanitizeWorkable(workable) as Workable<C>;
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

		let target: string;
		if (this._id !== undefined) {
			// Create a RecordId for the target instead of concatenating variables
			const recordId = new RecordId(this.tb, this._id);
			target = ctx.var(recordId);
		} else {
			target = ctx.var(new Table(this.tb));
		}

		let query = /* surql */ `CREATE ${target}`;

		query += displayModificationClause(this, ctx);

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
