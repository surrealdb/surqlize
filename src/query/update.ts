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
	applyUnset,
	displayModificationClause,
	type JsonPatchOp,
	type ModificationMode,
	type ModificationState,
	type SetData,
	type WriteData,
} from "./modification-methods.ts";
import { type WhereObject, whereFromObject } from "./object-filter.ts";
import { resolveSubjectSchema } from "./subject.ts";
import { andWhere } from "./utils.ts";
import { validateWrite } from "./validate-input.ts";

/**
 * A fluent UPDATE query builder. Supports SET, UNSET, CONTENT, MERGE, PATCH,
 * REPLACE, WHERE, RETURN, and TIMEOUT clauses.
 */
export class UpdateQuery<
		O extends Orm,
		C extends WorkableContext<O>,
		T extends keyof O["tables"] & string,
		E extends AbstractType = O["tables"][T]["schema"],
		Only extends boolean = false,
	>
	extends Query<C, QueryResult<E, Only>>
	implements ModificationState
{
	readonly [__ctx]: C;
	private _only = false;
	_set?: Record<string, unknown>;
	_unset?: string[];
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

	get [__type](): QueryResult<E, Only> {
		const schema =
			this._return && typeof this._return !== "string"
				? this._return[__type]
				: this.schema;
		return (this._only ? schema : t.array(schema)) as QueryResult<E, Only>;
	}

	only(): UpdateQuery<O, C, T, E, true> {
		return this.derive((next) => {
			next._only = true;
		}) as UpdateQuery<O, C, T, E, true>;
	}

	set(data: E extends ObjectType ? Partial<SetData<E>> : never): this {
		return this.derive((next) =>
			applySet(next, data as Record<string, unknown>),
		);
	}

	unset(fields: E extends ObjectType ? (keyof E["schema"])[] : string[]): this {
		return this.derive((next) => applyUnset(next, fields as string[]));
	}

	content(data: Partial<WriteData<E>>): this {
		return this.derive((next) => applyContent(next, data));
	}

	merge(data: Partial<WriteData<E>>): this {
		return this.derive((next) => applyMerge(next, data));
	}

	patch(operations: JsonPatchOp[]): this {
		return this.derive((next) => applyPatch(next, operations));
	}

	replace(data: Partial<WriteData<E>>): this {
		return this.derive((next) => applyReplace(next, data));
	}

	where(cb: (tb: Actionable<C, O["tables"][T]["schema"]>) => Workable<C>): this;
	where(filter: WhereObject<C, O["tables"][T]["schema"]>): this;
	where(
		input:
			| ((tb: Actionable<C, O["tables"][T]["schema"]>) => Workable<C>)
			| WhereObject<C, O["tables"][T]["schema"]>,
	): this {
		const tb = actionable({
			[__ctx]: this[__ctx],
			[__type]: resolveSubjectSchema(this[__ctx].orm, this.tb),
			[__display]: ({ contextId }) => {
				return contextId === this[__ctx].id ? "$this" : "$parent";
			},
		}) as Actionable<C, O["tables"][T]["schema"]>;

		const condition =
			typeof input === "function"
				? input(tb)
				: whereFromObject(tb as unknown as Workable<C>, input);
		// An object filter that imposes no condition (such as `where({})`) adds
		// nothing, so the filter already on the query stays.
		if (!condition) return this;

		const filter = sanitizeWorkable(condition as Workable<C>);
		return this.derive((next) => {
			next._filter = andWhere(next._filter, filter);
		});
	}

	/** Remove every `.where()` condition set so far. */
	clearWhere(): this {
		return this.derive((next) => {
			next._filter = undefined;
		});
	}

	return(mode: "none" | "before" | "after" | "diff"): this;
	return<
		P extends Inheritable<C>,
		R extends InheritableIntoType<C, P> = InheritableIntoType<C, P>,
	>(cb: (tb: Actionable<C, E>) => P): UpdateQuery<O, C, T, R, Only>;
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

		let query = /* surql */ `UPDATE ${this._only ? "ONLY " : ""}${thing}`;

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
