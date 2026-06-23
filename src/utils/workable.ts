import { mergeSchemas } from "../query/subject.ts";
import type { Orm } from "../schema";
import {
	type AbstractType,
	ArrayType,
	GraphType,
	type ObjectType,
	OptionType,
	RecordType,
} from "../types";
import type { DisplayContext } from "./display";

export const __display: unique symbol = Symbol("display");
export const __type: unique symbol = Symbol("type");
export const __ctx: unique symbol = Symbol("ctx");

export type Workable<
	C extends WorkableContext = WorkableContext,
	T extends AbstractType = AbstractType,
> = {
	[__display]: (ctx: DisplayContext) => string;
	[__type]: T;
	[__ctx]: C;
};

// biome-ignore lint/suspicious/noExplicitAny: default context must accept any typed ORM instance
export type WorkableContext<O extends Orm<any> = Orm<any>> = {
	orm: O;
	id: symbol;
};

export type IntoWorkable<
	C extends WorkableContext,
	T extends AbstractType = AbstractType,
> = T["infer"] | Workable<C, T>;

export function intoWorkable<C extends WorkableContext, T extends AbstractType>(
	ctx: C,
	type: T,
	value: T["infer"] | Workable<C, T>,
): Workable<C, T> {
	if (isWorkable(value)) {
		return value as Workable<C, T>;
	}

	return {
		[__ctx]: ctx,
		[__display](ctx: DisplayContext) {
			return ctx.var(value);
		},
		[__type]: type,
	};
}

/** Wrap `type` in `OptionType` unless it already is one (no `option<option<…>>`). */
function optional(type: AbstractType): AbstractType {
	return type instanceof OptionType ? type : new OptionType(type);
}

/** The schema a record link's fields resolve against, or `undefined` if none. */
function linkedSchema(orm: Orm, tb: RecordType["tb"]): ObjectType | undefined {
	const names = typeof tb === "string" ? [tb] : Array.isArray(tb) ? tb : [];
	const schemas: ObjectType[] = [];
	for (const name of names) {
		const schema = orm.tables[name]?.schema;
		if (schema) schemas.push(schema as ObjectType);
	}
	if (schemas.length === 0) return undefined;
	return schemas.length === 1 ? schemas[0] : mergeSchemas(schemas);
}

/**
 * Resolve which type a property access should be looked up against, peeling the
 * "see-through" wrappers SurrealDB dereferences transparently:
 *
 * - `option<T>` is transparent for access (SurrealDB returns `NONE` when reading
 *   through a `NONE`), so we descend into `T` and re-wrap the accessed field in
 *   `option<…>` to keep it optional.
 * - a record link `record<tb>` resolves its fields against `tb`'s schema (a
 *   single table, or the {@link mergeSchemas | merged} schema of a multi-table
 *   link); the field keeps its own type — unlike a graph step, which yields an
 *   array of links.
 * - a graph step `->edge->tb` resolves against `tb` but wraps each field in
 *   `array<…>`, because a step yields many records.
 *
 * Anything else (objects, arrays, scalars) resolves against itself. An
 * unregistered or unknown target table falls back to the type's own `get`,
 * which yields `NoneType` — matching the pre-existing graph behaviour.
 */
function resolveAccessType(
	orm: Orm,
	type: AbstractType,
): { target: AbstractType; rewrap: (field: AbstractType) => AbstractType } {
	if (type instanceof OptionType) {
		const inner = resolveAccessType(orm, type.schema);
		return { target: inner.target, rewrap: (f) => optional(inner.rewrap(f)) };
	}

	if (type instanceof GraphType && type.tb !== "*") {
		const schema = orm.tables[type.tb]?.schema;
		if (schema) return { target: schema, rewrap: (f) => new ArrayType(f) };
	}

	if (type instanceof RecordType) {
		const schema = linkedSchema(orm, type.tb);
		if (schema) return { target: schema, rewrap: (f) => f };
	}

	return { target: type, rewrap: (f) => f };
}

export function workableGet(workable: Workable, key: string | number) {
	const { target, rewrap } = resolveAccessType(
		workable[__ctx].orm,
		workable[__type],
	);
	const [fieldType, path] = target.get(key);
	const type = rewrap(fieldType);

	return {
		[__ctx]: workable[__ctx],
		[__display](ctx: DisplayContext) {
			const parent = workable[__display](ctx);
			return `${parent}${path}`;
		},
		[__type]: type,
	};
}

export function sanitizeWorkable<
	C extends WorkableContext,
	T extends AbstractType,
>(workable: Workable<C, T>): Workable<C, T> {
	return {
		[__ctx]: workable[__ctx],
		[__display]: workable[__display],
		[__type]: workable[__type],
	};
}

export function isWorkable<C extends WorkableContext>(
	value: unknown,
): value is Workable<C> {
	return (
		(typeof value === "object" || typeof value === "function") &&
		value !== null &&
		(value as Workable<C>)[__ctx] !== undefined
	);
}
