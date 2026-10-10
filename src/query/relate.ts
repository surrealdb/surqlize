import { type RecordId, Table } from "surrealdb";
import type { Orm } from "../schema/orm.ts";
import {
	type AbstractType,
	type ArrayType,
	type NeverType,
	type ObjectType,
	type OptionType,
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
import { schemaDefaults, withDefaults } from "./defaults.ts";
import {
	applyContent,
	applyMerge,
	applyPatch,
	applyReplace,
	applySet,
	assertDottedRootsSupplied,
	type CreateInput,
	displayModificationClause,
	type JsonPatchOp,
	type ModificationMode,
	type ModificationState,
	type OrphanDottedKeys,
	type SetData,
	type WriteData,
} from "./modification-methods.ts";
import { validateWrite } from "./validate-input.ts";
import type {
	FullWrite,
	NoWrite,
	WriteRow,
	WriteShape,
	Written,
} from "./write-result.ts";

/**
 * What an edge's `in` or `out` can be: a record, a list of records, or a query
 * that yields records. A query is rendered as a subquery, so its rows supply the
 * endpoint records: a record type, or table rows (a `select()`, optionally with
 * `.only()`), which always carry an `id`.
 */
export type RelateEndpoint<C extends WorkableContext = WorkableContext> =
	| RecordId
	| RecordId[]
	| Workable<C, RecordType>
	| Workable<C, ArrayType<RecordType>>
	| Workable<C, ObjectType<{ id: RecordType<string> }>>
	| Workable<C, ArrayType<ObjectType<{ id: RecordType<string> }>>>;

/**
 * What a RELATE returns, as set by `.return()`:
 *
 * - `row`: the edge rows (`RETURN AFTER`, a projection, or no `RETURN` at all).
 * - `none`: no rows (`RETURN NONE`). With `.only()` the result is NONE, which
 *   is `undefined`.
 * - `before`: the edge's state before the write (`RETURN BEFORE`). A RELATE
 *   creates its edge, so there is no before-state and each entry is NONE.
 */
export type RelateReturnMode = "row" | "none" | "before";

/** The result mode a `.return()` argument selects: `after` and `diff` give rows. */
type ReturnModeOf<M extends string> = M extends "none" | "before" ? M : "row";

/** The result of a RELATE that returns `Mode`, see {@link RelateReturnMode}. */
type RelateResult<
	E extends AbstractType,
	W extends WriteShape,
	Only extends boolean,
	Mode extends RelateReturnMode,
> = Mode extends "none"
	? Only extends true
		? OptionType<NeverType>
		: ArrayType<NeverType>
	: Mode extends "before"
		? QueryResult<OptionType<WriteRow<E, W, "relate">>, Only>
		: QueryResult<WriteRow<E, W, "relate">, Only>;

/**
 * A fluent RELATE query builder for creating graph edges between records.
 * Supports SET, CONTENT, MERGE, PATCH, REPLACE, RETURN, and TIMEOUT clauses.
 *
 * `W` describes what has been written so far. It sets the type of the rows the
 * query returns: see {@link WriteRow}.
 */
export class RelateQuery<
		O extends Orm,
		C extends WorkableContext<O>,
		Edge extends keyof O["tables"] & string,
		E extends AbstractType = O["tables"][Edge]["schema"],
		Only extends boolean = false,
		W extends WriteShape = NoWrite,
		Mode extends RelateReturnMode = "row",
	>
	extends Query<C, RelateResult<E, W, Only, Mode>>
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
	private _return?: "none" | "before" | "after" | "diff" | Workable<C, E>;
	private _timeout?: string;

	constructor(
		orm: O,
		readonly edge: Edge,
		readonly from: RelateEndpoint<C>,
		readonly to: RelateEndpoint<C>,
	) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		} as C;
		this._lenient = true;
	}

	get schema(): E {
		return this[__ctx].orm.tables[this.edge]!.schema as unknown as E;
	}

	get [__type](): RelateResult<E, W, Only, Mode> {
		let type: AbstractType;
		if (this._return === "none") {
			type = this._only ? t.option(t.never()) : t.array(t.never());
		} else {
			const row =
				this._return && typeof this._return !== "string"
					? this._return[__type]
					: this.schema;
			// A RELATE creates its edge, so RETURN BEFORE has no state to give: NONE.
			const element = this._return === "before" ? t.option(row) : row;
			type = this._only ? element : t.array(element);
		}
		return type as unknown as RelateResult<E, W, Only, Mode>;
	}

	only(): RelateQuery<O, C, Edge, E, true, W, Mode> {
		return this.derive((next) => {
			next._only = true;
		}) as RelateQuery<O, C, Edge, E, true, W, Mode>;
	}

	/** Set fields on the edge. Fields that are not set are absent from the result. */
	set<const D extends E extends ObjectType ? Partial<SetData<E>> : never>(
		data: D & OrphanDottedKeys<D>,
	): RelateQuery<O, C, Edge, E, Only, Written<W, "set", D>, Mode> {
		assertDottedRootsSupplied(data as Record<string, unknown>);
		return this.derive((next) => {
			applySet(next, data as Record<string, unknown>);
		}) as unknown as RelateQuery<
			O,
			C,
			Edge,
			E,
			Only,
			Written<W, "set", D>,
			Mode
		>;
	}

	content(
		data: E extends ObjectType
			? Omit<CreateInput<E>, "in" | "out">
			: E["infer"],
	): RelateQuery<O, C, Edge, E, Only, FullWrite, Mode> {
		return this.derive((next) => {
			applyContent(next, data);
			// A full record is checked strictly: every field is there.
			next._lenient = false;
		}) as unknown as RelateQuery<O, C, Edge, E, Only, FullWrite, Mode>;
	}

	merge<const D extends Partial<WriteData<E>>>(
		data: D,
	): RelateQuery<O, C, Edge, E, Only, Written<W, "set", D>, Mode> {
		return this.derive((next) => {
			applyMerge(next, data);
		}) as unknown as RelateQuery<
			O,
			C,
			Edge,
			E,
			Only,
			Written<W, "set", D>,
			Mode
		>;
	}

	patch(
		operations: JsonPatchOp[],
	): RelateQuery<
		O,
		C,
		Edge,
		E,
		Only,
		{ keys: never; maybe: never; gone: never; mode: "patch" },
		Mode
	> {
		return this.derive((next) => {
			applyPatch(next, operations);
		}) as unknown as RelateQuery<
			O,
			C,
			Edge,
			E,
			Only,
			{ keys: never; maybe: never; gone: never; mode: "patch" },
			Mode
		>;
	}

	/** Replace the edge's data. REPLACE does not apply defaults, so only the given fields are known. */
	replace<const D extends Partial<WriteData<E>>>(
		data: D,
	): RelateQuery<O, C, Edge, E, Only, Written<NoWrite, "replace", D>, Mode> {
		return this.derive((next) => {
			applyReplace(next, data);
		}) as unknown as RelateQuery<
			O,
			C,
			Edge,
			E,
			Only,
			Written<NoWrite, "replace", D>,
			Mode
		>;
	}

	return(mode: "none"): RelateQuery<O, C, Edge, E, Only, W, "none">;
	return(mode: "before"): RelateQuery<O, C, Edge, E, Only, W, "before">;
	return(mode: "after" | "diff"): RelateQuery<O, C, Edge, E, Only, W, "row">;
	return<M extends "none" | "before" | "after" | "diff">(
		mode: M,
	): RelateQuery<O, C, Edge, E, Only, W, ReturnModeOf<M>>;
	return<P extends Inheritable<C>>(
		cb: (record: Actionable<C, WriteRow<E, W, "relate">>) => P,
	): RelateQuery<O, C, Edge, InheritableIntoType<C, P>, Only, FullWrite>;
	return(
		value:
			| "none"
			| "before"
			| "after"
			| "diff"
			| ((record: Actionable<C, WriteRow<E, W, "relate">>) => Inheritable<C>),
	): unknown {
		if (typeof value === "function") {
			const record = actionable({
				[__ctx]: this[__ctx],
				[__type]: this.schema,
				[__display]: ({ contextId }) => {
					return contextId === this[__ctx].id ? "$this" : "$parent";
				},
			}) as Actionable<C, WriteRow<E, W, "relate">>;

			const inheritable = value(record);
			const workable = inheritableIntoWorkable(inheritable) as Workable<C, E>;
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
		validateWrite(this[__ctx].orm, this.edge, this.schema, this, "relate");
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

		let query = /* surql */ `RELATE ${this._only ? "ONLY " : ""}${fromStr}->${edgeTable}->${toStr}`;

		// Like CREATE, RELATE applies the edge's declared defaults, so the stored
		// edge has every defaulted field its result type promises.
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
