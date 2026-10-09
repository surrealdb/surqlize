import { type RecordId, Table } from "surrealdb";
import type { Orm } from "../schema/orm.ts";
import {
	type AbstractType,
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
import { Query, type QueryResult } from "./abstract.ts";
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
	type WriteData,
} from "./modification-methods.ts";
import { resolveSubjectSchema } from "./subject.ts";
import { validateWrite } from "./validate-input.ts";
import {
	type FullWrite,
	type NoWrite,
	type WriteRow,
	type WriteShape,
	type Written,
} from "./write-result.ts";

/**
 * A fluent UPSERT query builder. Creates the record if it doesn't exist, or
 * updates it if it does. Supports SET, CONTENT, MERGE, PATCH, REPLACE, WHERE,
 * RETURN, and TIMEOUT clauses.
 */
export class UpsertQuery<
		O extends Orm,
		C extends WorkableContext<O>,
		T extends keyof O["tables"] & string,
		E extends AbstractType = O["tables"][T]["schema"],
		Only extends boolean = false,
		W extends WriteShape = NoWrite,
	>
	extends Query<C, QueryResult<WriteRow<E, W, "update">, Only>>
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
	private _filter?: Workable<C>;
	private _return?: "none" | "before" | "after" | "diff" | Workable<C, E>;
	private _timeout?: string;
	private tb: T | readonly T[];
	private subject: T | RecordId<T> | Workable<C, RecordType<T>>;

	constructor(orm: O, subject: T | RecordId<T> | Workable<C, RecordType<T>>) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		} as C;
		this._lenient = true;

		this.subject = subject;

		if (typeof subject === "string") {
			this.tb = subject;
		} else if (isWorkable(subject)) {
			// A polymorphic link (`t.record(["a", "b"])`) carries an array here.
			this.tb = (subject[__type] as RecordType<T>).tb;
		} else {
			this.tb = String((subject as RecordId<T>).table) as T;
		}
	}

	get schema(): E {
		return resolveSubjectSchema(this[__ctx].orm, this.tb) as unknown as E;
	}

	get [__type](): QueryResult<WriteRow<E, W, "update">, Only> {
		const schema =
			this._return && typeof this._return !== "string"
				? this._return[__type]
				: this.schema;
		return (this._only ? schema : t.array(schema)) as QueryResult<
			WriteRow<E, W, "update">,
			Only
		>;
	}

	only(): UpsertQuery<O, C, T, E, true, W> {
		return this.derive((next) => {
			next._only = true;
		}) as UpsertQuery<O, C, T, E, true, W>;
	}

	/**
	 * Set fields. A SET leaves the fields it does not set in place, or absent if
	 * the record is created, so those are typed as optional in the result.
	 */
	set<const D extends E extends ObjectType ? Partial<SetData<E>> : never>(
		data: D,
	): UpsertQuery<O, C, T, E, Only, Written<W, "set", D>> {
		return this.derive((next) => {
			applySet(next, data as Record<string, unknown>);
		}) as unknown as UpsertQuery<
			O,
			C,
			T,
			E,
			Only,
			Written<W, "set", D>
		>;
	}

	/** Replace the record with the given fields, so the other fields are gone. */
	content<const D extends Partial<WriteData<E>>>(
		data: D,
	): UpsertQuery<
		O,
		C,
		T,
		E,
		Only,
		Written<NoWrite, "replace", D>
	> {
		return this.derive((next) => {
			applyContent(next, data);
		}) as unknown as UpsertQuery<
			O,
			C,
			T,
			E,
			Only,
			Written<NoWrite, "replace", D>
		>;
	}

	merge<const D extends Partial<WriteData<E>>>(
		data: D,
	): UpsertQuery<O, C, T, E, Only, Written<W, "set", D>> {
		return this.derive((next) => {
			applyMerge(next, data);
		}) as unknown as UpsertQuery<
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
	): UpsertQuery<O, C, T, E, Only, { keys: never; maybe: never; gone: never; mode: "patch" }> {
		return this.derive((next) => {
			applyPatch(next, operations);
		}) as unknown as UpsertQuery<
			O,
			C,
			T,
			E,
			Only,
			{ keys: never; maybe: never; gone: never; mode: "patch" }
		>;
	}

	/** Replace the record. The other fields of the record are gone. */
	replace<const D extends Partial<WriteData<E>>>(
		data: D,
	): UpsertQuery<
		O,
		C,
		T,
		E,
		Only,
		Written<NoWrite, "replace", D>
	> {
		return this.derive((next) => {
			applyReplace(next, data);
		}) as unknown as UpsertQuery<
			O,
			C,
			T,
			E,
			Only,
			Written<NoWrite, "replace", D>
		>;
	}

	where(cb: (tb: Actionable<C, O["tables"][T]["schema"]>) => Workable<C>) {
		const tb = actionable({
			[__ctx]: this[__ctx],
			[__type]: resolveSubjectSchema(this[__ctx].orm, this.tb),
			[__display]: ({ contextId }) => {
				return contextId === this[__ctx].id ? "$this" : "$parent";
			},
		}) as Actionable<C, O["tables"][T]["schema"]>;

		const filter = sanitizeWorkable(cb(tb));
		return this.derive((next) => {
			next._filter = filter;
		});
	}

	/** The state before the write may not have the fields it set, so only the id is known. */
	return(
		mode: "before",
	): UpsertQuery<O, C, T, E, Only, { keys: never; maybe: never; gone: never; mode: "patch" }>;
	return(mode: "none" | "before" | "after" | "diff"): this;
	return<
		P extends Inheritable<C>,
		R extends InheritableIntoType<C, P> = InheritableIntoType<C, P>,
	>(
		cb: (tb: Actionable<C, WriteRow<E, W, "update">>) => P,
	): UpsertQuery<O, C, T, R, Only, FullWrite>;
	return(
		value:
			| "none"
			| "before"
			| "after"
			| "diff"
			| ((tb: Actionable<C, WriteRow<E, W, "update">>) => Inheritable<C>),
	): unknown {
		if (typeof value === "function") {
			const tb = actionable({
				[__ctx]: this[__ctx],
				[__type]: this.schema,
				[__display]: ({ contextId }) => {
					return contextId === this[__ctx].id ? "$this" : "$parent";
				},
			}) as Actionable<C, WriteRow<E, W, "update">>;

			const predicable = value(tb);
			const workable = inheritableIntoWorkable<C, typeof predicable>(
				predicable,
			) as unknown as Workable<C, E>;
			const ret = sanitizeWorkable(workable);
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
		validateWrite(
			this[__ctx].orm,
			String(this.tb),
			this.schema,
			this,
			"update",
		);
	}

	[__display](inp: DisplayContext) {
		const ctx = displayContext({
			...inp,
			contextId: this[__ctx].id,
		});

		const thing =
			typeof this.subject === "string"
				? ctx.var(new Table(this.subject))
				: isWorkable(this.subject)
					? this.subject[__display](ctx)
					: ctx.var(this.subject);

		let query = /* surql */ `UPSERT ${this._only ? "ONLY " : ""}${thing}`;

		query += displayModificationClause(this, ctx);

		if (this._filter)
			query += /* surql */ ` WHERE ${this._filter[__display](ctx)}`;

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
