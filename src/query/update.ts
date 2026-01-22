import { type RecordId, Table } from "surrealdb";
import type { Orm } from "../schema/orm.ts";
import {
	type AbstractType,
	type ArrayType,
	type NoneType,
	type ObjectType,
	type RecordType,
	type UnionType,
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
	isWorkable,
	sanitizeWorkable,
} from "../utils/workable.ts";
import { Query } from "./abstract.ts";

type SetValue<T extends AbstractType> =
	| T["infer"]
	| { "+=": T["infer"] }
	| { "-=": T["infer"] };

type SetData<T extends ObjectType> = {
	[K in keyof T["schema"]]?: SetValue<T["schema"][K]>;
};

type JsonPatchOp =
	| { op: "add"; path: string; value: unknown }
	| { op: "remove"; path: string }
	| { op: "replace"; path: string; value: unknown }
	| { op: "move"; from: string; path: string }
	| { op: "copy"; from: string; path: string }
	| { op: "test"; path: string; value: unknown };

export class UpdateQuery<
	O extends Orm,
	C extends WorkableContext<O>,
	T extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][T]["schema"],
> extends Query<C, ArrayType<E>> {
	readonly [__ctx]: C;
	private _set?: Record<string, unknown>;
	private _unset?: string[];
	private _content?: unknown;
	private _merge?: unknown;
	private _patch?: JsonPatchOp[];
	private _replace?: unknown;
	private _filter?: Workable<C>;
	private _return?: "none" | "before" | "after" | "diff" | Workable<C, E>;
	private _timeout?: string;
	private _modificationMode?: "set" | "content" | "merge" | "patch" | "replace";

	constructor(
		orm: O,
		readonly tb: T,
	) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		} as C;
	}

	get schema(): E {
		return this[__ctx].orm.tables[this.tb].schema as E;
	}

	get [__type](): ArrayType<E> {
		return t.array(this.schema);
	}

	private _checkModificationMode(mode: typeof this._modificationMode) {
		if (this._modificationMode && this._modificationMode !== mode) {
			throw new Error(
				`Cannot use ${mode}() when ${this._modificationMode}() has already been used`,
			);
		}
		this._modificationMode = mode;
	}

	set(data: E extends ObjectType ? Partial<SetData<E>> : never): this {
		this._checkModificationMode("set");

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

	unset(fields: E extends ObjectType ? (keyof E["schema"])[] : string[]): this {
		this._checkModificationMode("set");
		this._unset = [...(this._unset || []), ...(fields as string[])];
		return this;
	}

	content(data: Partial<E["infer"]>): this {
		this._checkModificationMode("content");
		this._content = data;
		return this;
	}

	merge(data: Partial<E["infer"]>): this {
		this._checkModificationMode("merge");
		this._merge = data;
		return this;
	}

	patch(operations: JsonPatchOp[]): this {
		this._checkModificationMode("patch");
		this._patch = operations;
		return this;
	}

	replace(data: Partial<E["infer"]>): this {
		this._checkModificationMode("replace");
		this._replace = data;
		return this;
	}

	where(cb: (tb: Actionable<C, O["tables"][T]["schema"]>) => Workable<C>) {
		const tb = actionable({
			[__ctx]: this[__ctx],
			[__type]: this[__ctx].orm.tables[this.tb].schema,
			[__display]: ({ contextId }) => {
				return contextId === this[__ctx].id ? "$this" : "$parent";
			},
		}) as Actionable<C, O["tables"][T]["schema"]>;

		this._filter = sanitizeWorkable(cb(tb));
		return this;
	}

	return(mode: "none" | "before" | "after" | "diff"): this;
	return<
		P extends Inheritable<C>,
		R extends InheritableIntoType<C, P> = InheritableIntoType<C, P>,
	>(cb: (tb: Actionable<C, E>) => P): UpdateQuery<O, C, T, R>;
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

		const thing = ctx.var(new Table(this.tb));
		let query = /* surql */ `UPDATE ${thing}`;

		if (this._content) {
			query += /* surql */ ` CONTENT ${ctx.var(this._content)}`;
		} else if (this._merge) {
			query += /* surql */ ` MERGE ${ctx.var(this._merge)}`;
		} else if (this._patch) {
			query += /* surql */ ` PATCH ${ctx.var(this._patch)}`;
		} else if (this._replace) {
			query += /* surql */ ` REPLACE ${ctx.var(this._replace)}`;
		} else if (this._set || this._unset) {
			const parts: string[] = [];

			if (this._set) {
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
				if (assignments.length > 0) {
					parts.push(`SET ${assignments.join(", ")}`);
				}
			}

			if (this._unset && this._unset.length > 0) {
				parts.push(`UNSET ${this._unset.join(", ")}`);
			}

			if (parts.length > 0) {
				query += ` ${parts.join(" ")}`;
			}
		}

		if (this._filter)
			query += /* surql */ ` WHERE ${this._filter[__display](ctx)}`;

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

export class UpdateOneQuery<
	O extends Orm,
	C extends WorkableContext<O>,
	T extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][T]["schema"],
> extends Query<C, UnionType<(E | NoneType)[]>> {
	readonly [__ctx]: C;
	private _set?: Record<string, unknown>;
	private _unset?: string[];
	private _content?: unknown;
	private _merge?: unknown;
	private _patch?: JsonPatchOp[];
	private _replace?: unknown;
	private _return?: "none" | "before" | "after" | "diff" | Workable<C, E>;
	private _timeout?: string;
	private tb: T;
	private _modificationMode?: "set" | "content" | "merge" | "patch" | "replace";

	constructor(
		orm: O,
		readonly subject: RecordId<T> | Workable<C, RecordType<T>>,
	) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		} as C;

		if (isWorkable(subject)) {
			this.tb = subject[__type].tb;
		} else {
			this.tb = subject.tb;
		}
	}

	get schema(): E {
		return this[__ctx].orm.tables[this.tb].schema as E;
	}

	get [__type]() {
		return t.union([this.schema, t.none()]);
	}

	private _checkModificationMode(mode: typeof this._modificationMode) {
		if (this._modificationMode && this._modificationMode !== mode) {
			throw new Error(
				`Cannot use ${mode}() when ${this._modificationMode}() has already been used`,
			);
		}
		this._modificationMode = mode;
	}

	set(data: E extends ObjectType ? Partial<SetData<E>> : never): this {
		this._checkModificationMode("set");

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

	unset(fields: E extends ObjectType ? (keyof E["schema"])[] : string[]): this {
		this._checkModificationMode("set");
		this._unset = [...(this._unset || []), ...(fields as string[])];
		return this;
	}

	content(data: Partial<E["infer"]>): this {
		this._checkModificationMode("content");
		this._content = data;
		return this;
	}

	merge(data: Partial<E["infer"]>): this {
		this._checkModificationMode("merge");
		this._merge = data;
		return this;
	}

	patch(operations: JsonPatchOp[]): this {
		this._checkModificationMode("patch");
		this._patch = operations;
		return this;
	}

	replace(data: Partial<E["infer"]>): this {
		this._checkModificationMode("replace");
		this._replace = data;
		return this;
	}

	return(mode: "none" | "before" | "after" | "diff"): this;
	return<
		P extends Inheritable<C>,
		R extends InheritableIntoType<C, P> = InheritableIntoType<C, P>,
	>(cb: (tb: Actionable<C, E>) => P): UpdateOneQuery<O, C, T, R>;
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

		const thing = isWorkable(this.subject)
			? this.subject[__display](ctx)
			: ctx.var(this.subject);

		let query = /* surql */ `UPDATE ${thing}`;

		if (this._content) {
			query += /* surql */ ` CONTENT ${ctx.var(this._content)}`;
		} else if (this._merge) {
			query += /* surql */ ` MERGE ${ctx.var(this._merge)}`;
		} else if (this._patch) {
			query += /* surql */ ` PATCH ${ctx.var(this._patch)}`;
		} else if (this._replace) {
			query += /* surql */ ` REPLACE ${ctx.var(this._replace)}`;
		} else if (this._set || this._unset) {
			const parts: string[] = [];

			if (this._set) {
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
				if (assignments.length > 0) {
					parts.push(`SET ${assignments.join(", ")}`);
				}
			}

			if (this._unset && this._unset.length > 0) {
				parts.push(`UNSET ${this._unset.join(", ")}`);
			}

			if (parts.length > 0) {
				query += ` ${parts.join(" ")}`;
			}
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
