import { OrmError } from "../error.ts";
import { joiningFilter, prefixedFilter } from "../functions/filters.ts";
import {
	type AbstractType,
	type ArrayType,
	ObjectType,
	type StringType,
} from "../types";
import type { ActionableProps } from "../utils/actionable.ts";
import {
	__ctx,
	__type,
	type IntoWorkable,
	isWorkable,
	resolveAccessType,
	type Workable,
	type WorkableContext,
} from "../utils/workable.ts";

/**
 * Object-based filters and sorting (issue #45).
 *
 * `where({ name: "x", age: { gt: 18 } })` and `orderBy({ age: "desc" })` are
 * compiled down to the very same condition / ORDER BY machinery the fluent
 * callbacks use (`row.name.eq("x").and(row.age.gt(18))`), so both forms render
 * identical SurrealQL and can be mixed freely.
 */

// --- Types -------------------------------------------------------------------

type PropKeys<C extends WorkableContext, F extends AbstractType> = Extract<
	keyof ActionableProps<C, F>,
	string
>;

/** The schema type behind an `Actionable` field accessor. */
type PropType<C extends WorkableContext, A> =
	A extends Workable<C, infer X> ? X : never;

/** Type-specific operators, layered on top of the universal ones. */
type TypeOperators<
	C extends WorkableContext,
	F extends AbstractType,
> = F extends StringType
	? {
			startsWith?: IntoWorkable<C, StringType>;
			endsWith?: IntoWorkable<C, StringType>;
			contains?: IntoWorkable<C, StringType>;
			search?: IntoWorkable<C, StringType>;
		}
	: F extends ArrayType<infer E extends AbstractType>
		? {
				contains?: IntoWorkable<C, E>;
				containsNot?: IntoWorkable<C, E>;
				containsAll?: IntoWorkable<C, ArrayType<E>>;
				containsAny?: IntoWorkable<C, ArrayType<E>>;
				containsNone?: IntoWorkable<C, ArrayType<E>>;
				allInside?: IntoWorkable<C, ArrayType<E>>;
				anyInside?: IntoWorkable<C, ArrayType<E>>;
				noneInside?: IntoWorkable<C, ArrayType<E>>;
			}
		: unknown;

/**
 * The operator object accepted for a field: `{ gt: 18 }`, `{ inside: [...] }`.
 * Each key maps to the fluent method of the same name; several keys on one
 * field are AND-ed together.
 */
export type OperatorFilter<
	C extends WorkableContext,
	F extends AbstractType,
> = {
	eq?: IntoWorkable<C, F>;
	ne?: IntoWorkable<C, F>;
	ex?: IntoWorkable<C, F>;
	gt?: IntoWorkable<C, F>;
	gte?: IntoWorkable<C, F>;
	lt?: IntoWorkable<C, F>;
	lte?: IntoWorkable<C, F>;
	inside?: IntoWorkable<C, ArrayType<F>>;
	notInside?: IntoWorkable<C, ArrayType<F>>;
} & TypeOperators<C, F>;

/** What a single field may be compared against in a {@link WhereObject}. */
export type FieldCondition<C extends WorkableContext, F extends AbstractType> =
	// A bare value (or workable) is shorthand for `{ eq: value }`.
	| IntoWorkable<C, F>
	| OperatorFilter<C, F>
	// Fields of an object, or of a linked record, can be filtered in place.
	| WhereObject<C, F>;

/** The `and` / `or` / `not` combinators accepted at every level. */
type Combinators<C extends WorkableContext, F extends AbstractType> = {
	and?: WhereObject<C, F>[];
	or?: WhereObject<C, F>[];
	not?: WhereObject<C, F>;
};

/**
 * An object-form `where` filter over `F` (a row, an object, or a record link):
 * every key is a field of `F`, mapped to a {@link FieldCondition}. Keys are
 * AND-ed together; `and` / `or` / `not` combine nested filters. A field whose
 * value is `undefined` is ignored, so optional query parameters can be passed
 * straight through. Resolves to `never` for types that have no fields.
 */
export type WhereObject<C extends WorkableContext, F extends AbstractType> = [
	PropKeys<C, F>,
] extends [never]
	? never
	: {
			[K in PropKeys<C, F>]?: FieldCondition<
				C,
				PropType<C, ActionableProps<C, F>[K]>
			>;
		} & Combinators<C, F>;

/** A sort direction, in either case. */
export type OrderDirection = "asc" | "desc" | "ASC" | "DESC";

/**
 * An object-form `orderBy` over `F`: each key is a field mapped to a direction,
 * or (for object / record-link fields) to a nested object sorting by their
 * fields. Keys are applied in insertion order; `undefined` values are ignored.
 */
export type OrderByObject<C extends WorkableContext, F extends AbstractType> = [
	PropKeys<C, F>,
] extends [never]
	? never
	: {
			[K in PropKeys<C, F>]?:
				| OrderDirection
				| OrderByObject<C, PropType<C, ActionableProps<C, F>[K]>>;
		};

// --- Runtime -----------------------------------------------------------------

const OPERATORS: ReadonlySet<string> = new Set([
	"eq",
	"ne",
	"ex",
	"gt",
	"gte",
	"lt",
	"lte",
	"inside",
	"notInside",
	"contains",
	"containsNot",
	"containsAll",
	"containsAny",
	"containsNone",
	"allInside",
	"anyInside",
	"noneInside",
	"startsWith",
	"endsWith",
	"search",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/** The field names reachable through `target` (an object, record link, …). */
function fieldNames(target: Workable): ReadonlySet<string> {
	const { target: resolved } = resolveAccessType(
		target[__ctx].orm,
		target[__type],
	);
	return new Set(
		resolved instanceof ObjectType ? Object.keys(resolved.schema) : [],
	);
}

function combine(
	ctx: WorkableContext,
	kind: "AND" | "OR",
	conditions: Workable[],
): Workable | undefined {
	if (conditions.length === 0) return undefined;
	if (conditions.length === 1) return conditions[0];
	return joiningFilter(ctx, kind, ...conditions);
}

function asObjectArray(key: string, value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value) || !value.every(isPlainObject)) {
		throw new OrmError(
			`"${key}" in a where object must be an array of filter objects`,
		);
	}
	return value;
}

/**
 * Read a field off an actionable. A field whose name collides with a fluent
 * method (`eq`, `gt`, …) comes back as that method, with the field itself
 * available through `valueOf()`.
 */
function fieldOf(target: Workable, key: string): Workable {
	const field = (target as unknown as Record<string, unknown>)[key];
	return (typeof field === "function" ? field.valueOf() : field) as Workable;
}

function callOperator(field: Workable, op: string, value: unknown): Workable {
	const fn = (field as unknown as Record<string, unknown>)[op];
	if (typeof fn !== "function") {
		throw new OrmError(
			`Operator "${op}" is not supported on a ${field[__type].name} field`,
		);
	}
	return fn(value) as Workable;
}

/**
 * Compile one filter object against `target` into the list of conditions it
 * implies. `isField` is false for the row root, where operators have no meaning.
 * A key that names a field of `target` always wins over an operator or
 * combinator of the same name.
 */
function conditionsOf(
	target: Workable,
	input: Record<string, unknown>,
	isField: boolean,
): Workable[] {
	const names = fieldNames(target);
	const out: Workable[] = [];

	for (const [key, value] of Object.entries(input)) {
		if (value === undefined) continue;

		let condition: Workable | Workable[] | undefined;
		if (names.has(key)) {
			condition = fieldConditions(fieldOf(target, key), value);
		} else if (key === "and" || key === "or" || key === "not") {
			condition = combinatorCondition(target, key, value, isField);
		} else if (isField && OPERATORS.has(key)) {
			condition = callOperator(target, key, value);
		} else {
			throw new OrmError(`Unknown field "${key}" in where object`);
		}

		if (Array.isArray(condition)) out.push(...condition);
		else if (condition) out.push(condition);
	}

	return out;
}

/** A field compared against a bare value (`eq`), or filtered in place. */
function fieldConditions(field: Workable, value: unknown): Workable[] {
	if (isWorkable(value) || !isPlainObject(value)) {
		return [callOperator(field, "eq", value)];
	}
	return conditionsOf(field, value, true);
}

/** Compile an `and` / `or` / `not` entry, or `undefined` when it is empty. */
function combinatorCondition(
	target: Workable,
	key: "and" | "or" | "not",
	value: unknown,
	isField: boolean,
): Workable | undefined {
	const ctx = target[__ctx];
	const group = (kind: "AND" | "OR", items: Record<string, unknown>[]) =>
		combine(
			ctx,
			kind,
			items
				.map((o) => combine(ctx, "AND", conditionsOf(target, o, isField)))
				.filter((g): g is Workable => g !== undefined),
		);

	if (key !== "not") {
		return group(key === "and" ? "AND" : "OR", asObjectArray(key, value));
	}
	if (!isPlainObject(value)) {
		throw new OrmError(`"not" in a where object must be a filter object`);
	}
	const inner = group("AND", [value]);
	// Parenthesise first: `!` binds tighter than comparison operators.
	return inner
		? prefixedFilter(ctx, "!", joiningFilter(ctx, "AND", inner))
		: undefined;
}

/**
 * Compile an object-form `where` into a condition, or `undefined` when the
 * object imposes none (empty, or only `undefined` values).
 */
export function whereFromObject(
	row: Workable,
	input: unknown,
): Workable | undefined {
	if (!isPlainObject(input)) {
		throw new OrmError("where() expects a callback or a filter object");
	}
	return combine(row[__ctx], "AND", conditionsOf(row, input, false));
}

export type ResolvedOrder = { field: string; direction: "ASC" | "DESC" };

/** Compile an object-form `orderBy` into ordered (field path, direction) pairs. */
export function orderFromObject(
	row: Workable,
	input: unknown,
	prefix: string[] = [],
): ResolvedOrder[] {
	if (!isPlainObject(input)) {
		throw new OrmError("orderBy() expects a field, a callback or an object");
	}
	const names = fieldNames(row);
	const out: ResolvedOrder[] = [];

	for (const [key, value] of Object.entries(input)) {
		if (value === undefined) continue;
		if (!names.has(key)) {
			throw new OrmError(`Unknown field "${key}" in orderBy object`);
		}
		const path = [...prefix, key];
		if (typeof value === "string") {
			const direction = value.toUpperCase();
			if (direction !== "ASC" && direction !== "DESC") {
				throw new OrmError(
					`Invalid sort direction "${value}" for "${path.join(".")}"; expected "asc" or "desc"`,
				);
			}
			out.push({ field: path.join("."), direction });
		} else if (isPlainObject(value)) {
			const field = fieldOf(row, key);
			out.push(...orderFromObject(field, value, path));
		} else {
			throw new OrmError(
				`Invalid sort direction for "${path.join(".")}"; expected "asc", "desc" or a nested object`,
			);
		}
	}
	return out;
}
