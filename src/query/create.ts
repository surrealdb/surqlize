import { RecordId, type RecordIdValue, Table } from "surrealdb";
import type { Orm } from "../schema/orm.ts";
import { type AbstractType, type ObjectType, t } from "../types";
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
import { Query, type QueryResult } from "./abstract.ts";
import { schemaDefaults, withDefaults } from "./defaults.ts";
import {
	applyContent,
	applyMerge,
	applyPatch,
	applyReplace,
	applySet,
	type CreateInput,
	displayModificationClause,
	type JsonPatchOp,
	type ModificationMode,
	type ModificationState,
	type SetData,
	type WriteData,
} from "./modification-methods.ts";
import { validateWrite } from "./validate-input.ts";
import {
	type FullWrite,
	type NoWrite,
	type WriteRow,
	type WriteShape,
	type Written,
} from "./write-result.ts";

/**
 * A fluent CREATE query builder. Supports SET, CONTENT, MERGE, PATCH, REPLACE,
 * RETURN, and TIMEOUT clauses.
 *
 * `W` describes what has been written so far. It sets the type of the rows the
 * query returns: see {@link WriteRow}.
 */
export class CreateQuery<
		O extends Orm,
		C extends WorkableContext<O>,
		T extends keyof O["tables"] & string,
		E extends AbstractType = O["tables"][T]["schema"],
		Only extends boolean = false,
		W extends WriteShape = NoWrite,
	>
	extends Query<C, QueryResult<WriteRow<E, W, "create">, Only>>
	implements ModificationState
{
	readonly [__ctx]: C;
	private _only = false;
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
		this._lenient = true;
		this._id = id;
	}

	get schema(): E {
		return this[__ctx].orm.tables[this.tb]!.schema as unknown as E;
	}

	get [__type](): QueryResult<WriteRow<E, W, "create">, Only> {
		const schema =
			this._return && typeof this._return !== "string"
				? this._return[__type]
				: this.schema;
		return (this._only ? schema : t.array(schema)) as QueryResult<
			WriteRow<E, W, "create">,
			Only
		>;
	}

	only(): CreateQuery<O, C, T, E, true, W> {
		return this.derive((next) => {
			next._only = true;
		}) as CreateQuery<O, C, T, E, true, W>;
	}

	/**
	 * Set fields. Fields that are not set are absent from the result, so the
	 * result only types the fields that are known to be there.
	 */
	set<const D extends E extends ObjectType ? Partial<SetData<E>> : never>(
		data: D,
	): CreateQuery<O, C, T, E, Only, Written<W, "set", D>> {
		return this.derive((next) => {
			applySet(next, data as Record<string, unknown>);
		}) as unknown as CreateQuery<
			O,
			C,
			T,
			E,
			Only,
			Written<W, "set", D>
		>;
	}

	content(
		data: E extends ObjectType ? CreateInput<E> : E["infer"],
	): CreateQuery<O, C, T, E, Only, FullWrite> {
		return this.derive((next) => {
			applyContent(next, data);
			// A full record is checked strictly: every field is there.
			next._lenient = false;
		}) as unknown as CreateQuery<
			O,
			C,
			T,
			E,
			Only,
			FullWrite
		>;
	}

	/** Merge fields into the record. Fields that are not merged are absent from the result. */
	merge<const D extends Partial<WriteData<E>>>(
		data: D,
	): CreateQuery<O, C, T, E, Only, Written<W, "set", D>> {
		return this.derive((next) => {
			applyMerge(next, data);
		}) as unknown as CreateQuery<
			O,
			C,
			T,
			E,
			Only,
			Written<W, "set", D>
		>;
	}

	patch(
		operations: JsonPatchOp[],
	): CreateQuery<
		O,
		C,
		T,
		E,
		Only,
		{ keys: never; maybe: never; gone: never; mode: "patch" }
	> {
		return this.derive((next) => {
			applyPatch(next, operations);
		}) as unknown as CreateQuery<
			O,
			C,
			T,
			E,
			Only,
			{ keys: never; maybe: never; gone: never; mode: "patch" }
		>;
	}

	/** Replace the record. REPLACE does not apply defaults, so only the given fields are known. */
	replace<const D extends Partial<WriteData<E>>>(
		data: D,
	): CreateQuery<
		O,
		C,
		T,
		E,
		Only,
		Written<NoWrite, "replace", D>
	> {
		return this.derive((next) => {
			applyReplace(next, data);
		}) as unknown as CreateQuery<
			O,
			C,
			T,
			E,
			Only,
			Written<NoWrite, "replace", D>
		>;
	}

	return(mode: "none" | "before" | "after" | "diff"): this;
	return<P extends Inheritable<C>>(
		cb: (record: Actionable<C, WriteRow<E, W, "create">>) => P,
	): CreateQuery<O, C, T, InheritableIntoType<C, ReturnType<typeof cb>>, Only, FullWrite>;
	return(
		value:
			| "none"
			| "before"
			| "after"
			| "diff"
			| ((record: Actionable<C, WriteRow<E, W, "create">>) => Inheritable<C>),
	): unknown {
		if (typeof value === "function") {
			const record = actionable({
				[__ctx]: this[__ctx],
				[__type]: this.schema,
				[__display]: ({ contextId }) => {
					return contextId === this[__ctx].id ? "$this" : "$parent";
				},
			}) as Actionable<C, WriteRow<E, W, "create">>;

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

	protected override validateInput(): void {
		validateWrite(this[__ctx].orm, this.tb, this.schema, this, "create");
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

		let query = /* surql */ `CREATE ${this._only ? "ONLY " : ""}${target}`;

		query += displayModificationClause(
			withDefaults(this, schemaDefaults(this.schema)),
			ctx,
		);

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
