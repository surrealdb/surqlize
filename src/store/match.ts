import { RecordId } from "surrealdb";
import { isWorkable } from "../utils/workable";

/**
 * `true`, `false`, or `undefined` when the client cannot tell. A row that is
 * not known to match is treated as unknown, never as a mismatch, so a guess is
 * only made when it is safe.
 */
export type Tri = boolean | undefined;

const OPERATORS = new Set([
	"eq",
	"ne",
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
]);

const COMBINATORS = new Set(["and", "or", "not"]);

const isPlain = (value: unknown): value is Record<string, unknown> => {
	if (typeof value !== "object" || value === null) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

/** Equality as SurrealQL sees it: by value, for dates, record ids, arrays and objects. */
function same(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a instanceof Date && b instanceof Date)
		return a.getTime() === b.getTime();
	if (a instanceof RecordId && b instanceof RecordId)
		return String(a) === String(b);
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((x, i) => same(x, b[i]));
	}
	if (isPlain(a) && isPlain(b)) {
		const keys = Object.keys(a);
		return (
			keys.length === Object.keys(b).length &&
			keys.every((k) => k in b && same(a[k], b[k]))
		);
	}
	if (
		typeof a === "object" &&
		typeof b === "object" &&
		a &&
		b &&
		a.constructor === b.constructor
	) {
		return String(a) === String(b);
	}
	return false;
}

const sign = (
	a: number | bigint | string,
	b: number | bigint | string,
): number => (a < b ? -1 : a > b ? 1 : 0);

const isNumber = (value: unknown): value is number | bigint =>
	typeof value === "number" || typeof value === "bigint";

/** Order two values of the same kind, or `undefined` for kinds not compared here. */
function compare(a: unknown, b: unknown): number | undefined {
	if (isNumber(a) && isNumber(b)) return sign(a, b);
	if (typeof a === "string" && typeof b === "string") return sign(a, b);
	if (a instanceof Date && b instanceof Date)
		return sign(a.getTime(), b.getTime());
	return undefined;
}

const not = (value: Tri): Tri => (value === undefined ? undefined : !value);

function ordered(
	value: unknown,
	arg: unknown,
	test: (c: number) => boolean,
): Tri {
	const c = compare(value, arg);
	return c === undefined ? undefined : test(c);
}

function contains(value: unknown, arg: unknown): Tri {
	if (Array.isArray(value)) return value.some((x) => same(x, arg));
	if (typeof value === "string" && typeof arg === "string")
		return value.includes(arg);
	return undefined;
}

/** How many members of `value` are in `arg`, for the set operators. */
function shared(
	value: unknown,
	arg: unknown,
): { count: number; size: number } | undefined {
	if (!Array.isArray(value) || !Array.isArray(arg)) return undefined;
	return {
		count: value.filter((x) => arg.some((y) => same(x, y))).length,
		size: value.length,
	};
}

const SET_TESTS: Record<
	string,
	(s: { count: number; size: number }) => boolean
> = {
	containsAny: (s) => s.count > 0,
	anyInside: (s) => s.count > 0,
	containsNone: (s) => s.count === 0,
	noneInside: (s) => s.count === 0,
	allInside: (s) => s.count === s.size,
};

const text = (
	value: unknown,
	arg: unknown,
	test: (v: string, a: string) => boolean,
): Tri =>
	typeof value === "string" && typeof arg === "string"
		? test(value, arg)
		: undefined;

/** Apply one operator to a field's value. */
function operate(op: string, value: unknown, arg: unknown): Tri {
	switch (op) {
		case "eq":
			return same(value, arg);
		case "ne":
			return !same(value, arg);
		case "gt":
			return ordered(value, arg, (c) => c > 0);
		case "gte":
			return ordered(value, arg, (c) => c >= 0);
		case "lt":
			return ordered(value, arg, (c) => c < 0);
		case "lte":
			return ordered(value, arg, (c) => c <= 0);
		case "inside":
			return Array.isArray(arg) ? arg.some((x) => same(value, x)) : undefined;
		case "notInside":
			return Array.isArray(arg) ? !arg.some((x) => same(value, x)) : undefined;
		case "contains":
			return contains(value, arg);
		case "containsNot":
			return not(contains(value, arg));
		case "containsAll":
			return Array.isArray(arg) && Array.isArray(value)
				? arg.every((y) => value.some((x) => same(x, y)))
				: undefined;
		case "startsWith":
			return text(value, arg, (v, a) => v.startsWith(a));
		case "endsWith":
			return text(value, arg, (v, a) => v.endsWith(a));
		default: {
			const test = SET_TESTS[op];
			const counted = test ? shared(value, arg) : undefined;
			return test && counted ? test(counted) : undefined;
		}
	}
}

/** `and` of three-valued results: a false wins, then an unknown. */
const all = (results: Tri[]): Tri =>
	results.includes(false)
		? false
		: results.includes(undefined)
			? undefined
			: true;

/** `or` of three-valued results: a true wins, then an unknown. */
const any = (results: Tri[]): Tri =>
	results.includes(true)
		? true
		: results.includes(undefined)
			? undefined
			: false;

type Context = {
	/** The row is only what a write carries, so a missing field may be filled in by the database. */
	partial: boolean;
};

/** Operators that have an answer for a field that is not set. */
const ANSWERS_FOR_NONE = new Set(["eq", "ne", "inside", "notInside"]);

/** A value a nested filter can look into: an object with fields. */
const hasFields = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** One field's condition: a bare value (`eq`), an expression, or an operator or nested filter. */
function fieldTest(condition: unknown, value: unknown, ctx: Context): Tri {
	if (isWorkable(condition)) return undefined;
	if (!isPlain(condition)) return operate("eq", value, condition);
	return filterTest(condition, value, true, ctx);
}

function combinatorTest(
	key: string,
	condition: unknown,
	value: unknown,
	isField: boolean,
	ctx: Context,
): Tri {
	if (key === "not") {
		return isPlain(condition)
			? not(filterTest(condition, value, isField, ctx))
			: undefined;
	}
	if (!Array.isArray(condition) || !condition.every(isPlain)) return undefined;
	const results = condition.map((c) => filterTest(c, value, isField, ctx));
	return key === "and" ? all(results) : any(results);
}

function operatorTest(
	key: string,
	condition: unknown,
	value: unknown,
	ctx: Context,
): Tri {
	if (isWorkable(condition)) return undefined;
	// A missing value is unknown when the write may not have set it, and most
	// operators have no answer for one that is not set.
	if (value === undefined && (ctx.partial || !ANSWERS_FOR_NONE.has(key)))
		return undefined;
	return operate(key, value, condition);
}

/** A field of `value`: a field of the row, or of an object inside it. */
function nestedTest(
	key: string,
	condition: unknown,
	value: unknown,
	isField: boolean,
	ctx: Context,
): Tri {
	// Inside a field, only a plain object has fields to look at; a record link or
	// an array would need the linked records, which the client does not have.
	const container = isField
		? isPlain(value)
			? value
			: undefined
		: hasFields(value)
			? value
			: undefined;
	if (!container) return undefined;
	const child = container[key];
	if (child === undefined && ctx.partial) return undefined;
	return fieldTest(condition, child, ctx);
}

function entryTest(
	key: string,
	condition: unknown,
	value: unknown,
	isField: boolean,
	ctx: Context,
): Tri {
	// A field of the row wins over an operator or combinator of the same name.
	const isFieldName = hasFields(value) && key in value;
	if (!isFieldName && COMBINATORS.has(key))
		return combinatorTest(key, condition, value, isField, ctx);
	if (!isFieldName && isField && OPERATORS.has(key))
		return operatorTest(key, condition, value, ctx);
	return nestedTest(key, condition, value, isField, ctx);
}

function filterTest(
	filter: Record<string, unknown>,
	value: unknown,
	isField: boolean,
	ctx: Context,
): Tri {
	const results: Tri[] = [];
	for (const [key, condition] of Object.entries(filter)) {
		if (condition !== undefined)
			results.push(entryTest(key, condition, value, isField, ctx));
	}
	return all(results);
}

/**
 * Whether `row` satisfies an object-form `where` filter, as the database
 * would decide it: `true`, `false`, or `undefined` when the client cannot tell
 * (an operator it does not model, a value that is an expression, a field of a
 * linked record, a comparison of values it does not order).
 *
 * With `partial`, `row` is only what a write carries, so a field that is
 * missing is unknown rather than absent: the database may fill it in.
 */
export function matchesWhere(
	filter: Record<string, unknown> | undefined,
	row: unknown,
	options: { partial?: boolean } = {},
): Tri {
	if (filter === undefined) return true;
	return filterTest(filter, row, false, { partial: options.partial ?? false });
}
