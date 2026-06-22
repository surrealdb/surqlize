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
import { resolveSubjectSchema } from "./subject.ts";

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

	content(data: Partial<E["infer"]>): this {
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

	return(mode: "none" | "before" | "after" | "diff"): this;
	return<
		P extends Inheritable<C>,
		R extends InheritableIntoType<C, P> = InheritableIntoType<C, P>,
	>(cb: (tb: Actionable<C, E>) => P): UpsertQuery<O, C, T, R>;
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

		let query = /* surql */ `UPSERT ${thing}`;

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
