import { OrmError } from "../../error";
import {
	type AbstractType,
	type ArrayType,
	type BoolType,
	type LiteralType,
	NumberType,
	OptionType,
	type StringType,
	t,
	UnionType,
} from "../../types";
import {
	__ctx,
	__display,
	__type,
	type IntoWorkable,
	intoWorkable,
	type Workable,
	type WorkableContext,
} from "../../utils";
import { type Actionable, actionable } from "../../utils/actionable";
import {
	type Inheritable,
	type InheritableIntoType,
	inheritableIntoWorkable,
} from "../../utils/inheritable";
import type { At } from "../../utils/types";
import { comparingFilter } from "../filters";
import { databaseFunction } from "../utils";

/** The element type of an array: the single schema, or a union for a tuple. */
function elementType(arr: ArrayType): AbstractType {
	const schema = arr.schema;
	return Array.isArray(schema) ? new UnionType(schema) : schema;
}

/**
 * The distance metrics `knn()` accepts. SurrealQL takes them bare inside
 * `<|k,METRIC|>`, so they are whitelisted rather than interpolated as given.
 */
export const KNN_METRICS = [
	"EUCLIDEAN",
	"COSINE",
	"MANHATTAN",
	"CHEBYSHEV",
] as const;

export type KnnMetric = (typeof KNN_METRICS)[number];

/**
 * How `knn()` searches: brute force over a metric (`{ metric }`), or through an
 * index with a search width (`{ ef }`, HNSW `ef` or DiskANN `L`). SurrealQL has
 * no form without one of the two.
 */
export type KnnOptions =
	| { metric: KnnMetric; ef?: never }
	| { ef: number; metric?: never };

function positiveInteger(name: string, value: unknown): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
		throw new OrmError(
			`knn() ${name} must be a positive integer, got ${String(value)}`,
		);
	}
	return value;
}

/** The row prefix a field access renders with. */
const ROW_PREFIX = "$this.";

/** The `<|k,…|>` operator: a boolean predicate over a vector field. */
function knnFilter<C extends WorkableContext>(
	field: Workable<C>,
	query: Workable<C>,
	operator: string,
): Actionable<C, BoolType> {
	return actionable({
		[__ctx]: field[__ctx],
		[__type]: t.bool(),
		[__display](ctx) {
			// SurrealQL's KNN operator needs a plain field idiom on its left: with the
			// `$this.` row prefix a field access renders, the search matches nothing.
			const column = field[__display](ctx);
			if (!column.startsWith(ROW_PREFIX)) {
				throw new OrmError(
					"knn() must be called on a field of the queried row",
				);
			}
			const idiom = column.slice(ROW_PREFIX.length);
			return `(${idiom} ${operator} ${query[__display](ctx)})`;
		},
	});
}

/**
 * Functions only a vector field has: an `array<number>`. They are typed through
 * `GetFunctions`, so they do not appear on other arrays, and the runtime check
 * covers arrays reached through untyped code.
 */
export const vectorFunctions = {
	knn<C extends WorkableContext>(
		this: Workable<C, ArrayType<NumberType>>,
		query: IntoWorkable<C, ArrayType<NumberType>>,
		k: number,
		options: KnnOptions,
	) {
		if (!(this[__type].schema instanceof NumberType)) {
			throw new OrmError(
				"knn() can only be called on an array<number> field (a vector)",
			);
		}
		const limit = positiveInteger("k", k);
		let operator: string;
		if (options.metric !== undefined) {
			if (!(KNN_METRICS as readonly string[]).includes(options.metric)) {
				throw new OrmError(
					`knn() metric must be one of ${KNN_METRICS.join(", ")}, got ${String(options.metric)}`,
				);
			}
			operator = `<|${limit},${options.metric}|>`;
		} else if (options.ef !== undefined) {
			operator = `<|${limit},${positiveInteger("ef", options.ef)}|>`;
		} else {
			throw new OrmError("knn() needs a metric or an ef");
		}
		const vector = intoWorkable(this[__ctx], t.array(t.number()), query);
		return knnFilter(this, vector, operator);
	},
} satisfies VectorFunctions;

export type VectorFunctions = {
	knn<C extends WorkableContext>(
		this: Workable<C, ArrayType<NumberType>>,
		query: IntoWorkable<C, ArrayType<NumberType>>,
		k: number,
		options: KnnOptions,
	): Actionable<C, BoolType>;
};

export const functions = {
	// Contains
	contains<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
		return comparingFilter(this[__ctx], "CONTAINS", this, v);
	},
	containsNot<C extends WorkableContext>(
		this: Workable<C>,
		v: IntoWorkable<C>,
	) {
		return comparingFilter(this[__ctx], "CONTAINSNOT", this, v);
	},
	containsAll<C extends WorkableContext>(
		this: Workable<C>,
		v: IntoWorkable<C>,
	) {
		return comparingFilter(this[__ctx], "CONTAINSALL", this, v);
	},
	containsAny<C extends WorkableContext>(
		this: Workable<C>,
		v: IntoWorkable<C>,
	) {
		return comparingFilter(this[__ctx], "CONTAINSANY", this, v);
	},
	containsNone<C extends WorkableContext>(
		this: Workable<C>,
		v: IntoWorkable<C>,
	) {
		return comparingFilter(this[__ctx], "CONTAINSNONE", this, v);
	},

	// Inside
	allInside<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
		return comparingFilter(this[__ctx], "ALLINSIDE", this, v);
	},
	anyInside<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
		return comparingFilter(this[__ctx], "ANYINSIDE", this, v);
	},
	noneInside<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
		return comparingFilter(this[__ctx], "NONEINSIDE", this, v);
	},

	// Core mutation functions
	add<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: Workable<C>,
	) {
		return databaseFunction(this[__ctx], this[__type], "array::add", this, v);
	},
	append<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::append",
			this,
			v,
		);
	},
	prepend<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::prepend",
			this,
			v,
		);
	},
	push<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: Workable<C>,
	) {
		return databaseFunction(this[__ctx], this[__type], "array::push", this, v);
	},
	insert<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: Workable<C>,
		pos: IntoWorkable<C, NumberType>,
	) {
		const p = intoWorkable(this[__ctx], t.number(), pos);
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::insert",
			this,
			v,
			p,
		);
	},
	remove<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		pos: IntoWorkable<C, NumberType>,
	) {
		const p = intoWorkable(this[__ctx], t.number(), pos);
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::remove",
			this,
			p,
		);
	},
	pop<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		// Returns the removed element, or NONE for an empty array.
		return databaseFunction(
			this[__ctx],
			t.option(this[__type].schema),
			"array::pop",
			this,
		);
	},
	reverse<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(this[__ctx], this[__type], "array::reverse", this);
	},
	shuffle<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(this[__ctx], this[__type], "array::shuffle", this);
	},
	sort<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(this[__ctx], this[__type], "array::sort", this);
	},
	sortAsc<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::sort::asc",
			this,
		);
	},
	sortDesc<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::sort::desc",
			this,
		);
	},
	sortLexical<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::sort_lexical",
			this,
		);
	},
	sortNatural<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::sort_natural",
			this,
		);
	},
	sortNaturalLexical<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::sort_natural_lexical",
			this,
		);
	},
	distinct<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(this[__ctx], this[__type], "array::distinct", this);
	},
	flatten<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(this[__ctx], this[__type], "array::flatten", this);
	},
	group<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(this[__ctx], this[__type], "array::group", this);
	},
	fill<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: Workable<C>,
	) {
		return databaseFunction(this[__ctx], this[__type], "array::fill", this, v);
	},
	swap<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		a: IntoWorkable<C, NumberType>,
		b: IntoWorkable<C, NumberType>,
	) {
		const va = intoWorkable(this[__ctx], t.number(), a);
		const vb = intoWorkable(this[__ctx], t.number(), b);
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::swap",
			this,
			va,
			vb,
		);
	},

	// Set operation functions
	combine<
		C extends WorkableContext,
		T extends AbstractType,
		U extends AbstractType,
	>(this: Workable<C, ArrayType<T>>, other: Workable<C, ArrayType<U>>) {
		// One [a, b] pair per combination of an element of each array.
		const pair = t.array([this[__type].schema, other[__type].schema]);
		return databaseFunction(
			this[__ctx],
			t.array(pair),
			"array::combine",
			this,
			other,
		);
	},
	complement<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::complement",
			this,
			intoWorkable<C, AbstractType>(this[__ctx], this[__type], other),
		);
	},
	concat<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::concat",
			this,
			intoWorkable<C, AbstractType>(this[__ctx], this[__type], other),
		);
	},
	difference<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::difference",
			this,
			intoWorkable<C, AbstractType>(this[__ctx], this[__type], other),
		);
	},
	intersect<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::intersect",
			this,
			intoWorkable<C, AbstractType>(this[__ctx], this[__type], other),
		);
	},
	union<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::union",
			this,
			intoWorkable<C, AbstractType>(this[__ctx], this[__type], other),
		);
	},
	transpose<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::transpose",
			this,
		);
	},

	// Boolean array functions. SurrealDB coerces each element to a bool, so the
	// result is always an array of booleans whatever the input's element type.
	booleanAnd<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			t.array(t.bool()),
			"array::boolean_and",
			this,
			intoWorkable<C, AbstractType>(this[__ctx], this[__type], other),
		);
	},
	booleanOr<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			t.array(t.bool()),
			"array::boolean_or",
			this,
			intoWorkable<C, AbstractType>(this[__ctx], this[__type], other),
		);
	},
	booleanXor<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			t.array(t.bool()),
			"array::boolean_xor",
			this,
			intoWorkable<C, AbstractType>(this[__ctx], this[__type], other),
		);
	},
	booleanNot<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			t.array(t.bool()),
			"array::boolean_not",
			this,
		);
	},
	logicalAnd<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::logical_and",
			this,
			intoWorkable<C, AbstractType>(this[__ctx], this[__type], other),
		);
	},
	logicalOr<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::logical_or",
			this,
			intoWorkable<C, AbstractType>(this[__ctx], this[__type], other),
		);
	},
	logicalXor<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::logical_xor",
			this,
			intoWorkable<C, AbstractType>(this[__ctx], this[__type], other),
		);
	},

	// Search/query functions
	first<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type].schema,
			"array::first",
			this,
		);
	},
	last<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type].schema,
			"array::last",
			this,
		);
	},
	max<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type].schema,
			"array::max",
			this,
		);
	},
	min<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type].schema,
			"array::min",
			this,
		);
	},
	findIndex<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			t.number(),
			"array::find_index",
			this,
			v,
		);
	},
	filterIndex<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, T>,
	) {
		// The indexes of the matching elements, not the elements.
		return databaseFunction(
			this[__ctx],
			t.array(t.number()),
			"array::filter_index",
			this,
			intoWorkable(this[__ctx], this[__type].schema, v),
		);
	},

	// Other functions
	clump<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		size: IntoWorkable<C, NumberType>,
	) {
		const s = intoWorkable(this[__ctx], t.number(), size);
		return databaseFunction(this[__ctx], this[__type], "array::clump", this, s);
	},
	arrayJoin<C extends WorkableContext>(
		this: Workable<C, ArrayType>,
		delimiter: IntoWorkable<C, StringType>,
	) {
		const d = intoWorkable(this[__ctx], t.string(), delimiter);
		return databaseFunction(this[__ctx], t.string(), "array::join", this, d);
	},
	slice<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		start: IntoWorkable<C, NumberType>,
		end?: IntoWorkable<C, NumberType>,
	) {
		const s = intoWorkable(this[__ctx], t.number(), start);
		// SurrealDB rejects a NONE end, so it is omitted rather than bound.
		if (end === undefined) {
			return databaseFunction(
				this[__ctx],
				this[__type],
				"array::slice",
				this,
				s,
			);
		}
		const e = intoWorkable(this[__ctx], t.number(), end);
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::slice",
			this,
			s,
			e,
		);
	},
	isEmpty<C extends WorkableContext>(this: Workable<C, ArrayType>) {
		return databaseFunction(this[__ctx], t.bool(), "array::is_empty", this);
	},
	windows<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		size: IntoWorkable<C, NumberType>,
	) {
		const s = intoWorkable(this[__ctx], t.number(), size);
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::windows",
			this,
			s,
		);
	},

	map,

	at,

	val,

	len<C extends WorkableContext>(this: Workable<C, ArrayType>) {
		return databaseFunction(this[__ctx], t.number(), "array::len", this);
	},
} satisfies Functions;

export type Functions = {
	// Overloaded functions
	contains<C extends WorkableContext, T extends AbstractType[]>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, UnionType<T>>,
	): Actionable<C, BoolType>;
	contains<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, T>,
	): Actionable<C, BoolType>;

	containsNot<C extends WorkableContext, T extends AbstractType[]>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, UnionType<T>>,
	): Actionable<C, BoolType>;
	containsNot<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, T>,
	): Actionable<C, BoolType>;

	containsAll<C extends WorkableContext, T extends AbstractType[]>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, BoolType>;
	containsAll<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, BoolType>;

	containsAny<C extends WorkableContext, T extends AbstractType[]>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, BoolType>;
	containsAny<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, BoolType>;

	containsNone<C extends WorkableContext, T extends AbstractType[]>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, BoolType>;
	containsNone<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, BoolType>;

	allInside<C extends WorkableContext, T extends AbstractType[]>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, BoolType>;
	allInside<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, BoolType>;

	anyInside<C extends WorkableContext, T extends AbstractType[]>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, BoolType>;
	anyInside<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, BoolType>;

	noneInside<C extends WorkableContext, T extends AbstractType[]>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, BoolType>;
	noneInside<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, BoolType>;

	// Core mutation functions
	add<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	append<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	prepend<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	push<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	insert<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C>,
		pos: IntoWorkable<C, NumberType>,
	): Actionable<C, ArrayType<T>>;
	remove<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		pos: IntoWorkable<C, NumberType>,
	): Actionable<C, ArrayType<T>>;
	pop<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, OptionType<T>>;
	reverse<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<T>>;
	shuffle<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<T>>;
	sort<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<T>>;
	sortAsc<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<T>>;
	sortDesc<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<T>>;
	sortLexical<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<T>>;
	sortNatural<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<T>>;
	sortNaturalLexical<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<T>>;
	distinct<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<T>>;
	flatten<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<T>>;
	group<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<T>>;
	fill<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	swap<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		a: IntoWorkable<C, NumberType>,
		b: IntoWorkable<C, NumberType>,
	): Actionable<C, ArrayType<T>>;

	// Set operation functions
	combine<
		C extends WorkableContext,
		T extends AbstractType,
		U extends AbstractType,
	>(
		this: Workable<C, ArrayType<T>>,
		other: Workable<C, ArrayType<U>>,
	): Actionable<C, ArrayType<ArrayType<[T, U]>>>;
	complement<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	concat<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	difference<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	intersect<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	union<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	transpose<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<T>>;

	// Boolean array functions: the result is always an array of booleans
	booleanAnd<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<BoolType>>;
	booleanOr<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<BoolType>>;
	booleanXor<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<BoolType>>;
	booleanNot<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<BoolType>>;
	logicalAnd<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	logicalOr<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	logicalXor<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;

	// Search/query functions
	first<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, T>;
	last<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, T>;
	max<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, T>;
	min<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, T>;
	findIndex<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C>,
	): Actionable<C, NumberType>;
	filterIndex<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		v: IntoWorkable<C, T>,
	): Actionable<C, ArrayType<NumberType>>;

	// Other functions
	clump<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		size: IntoWorkable<C, NumberType>,
	): Actionable<C, ArrayType<T>>;
	arrayJoin<C extends WorkableContext>(
		this: Workable<C, ArrayType>,
		delimiter: IntoWorkable<C, StringType>,
	): Actionable<C, StringType>;
	/** Elements from `start` up to `end` (exclusive); without `end`, the rest. */
	slice<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		start: IntoWorkable<C, NumberType>,
		end?: IntoWorkable<C, NumberType>,
	): Actionable<C, ArrayType<T>>;
	isEmpty<C extends WorkableContext>(
		this: Workable<C, ArrayType>,
	): Actionable<C, BoolType>;
	windows<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		size: IntoWorkable<C, NumberType>,
	): Actionable<C, ArrayType<T>>;

	map<
		C extends WorkableContext,
		T extends AbstractType[],
		R extends Inheritable<C>,
	>(
		this: Workable<C, ArrayType<T>>,
		cb: (
			item: Actionable<C, UnionType<T>>,
			index: Actionable<C, NumberType>,
		) => R,
	): Actionable<C, ArrayType<InheritableIntoType<C, R>>>;
	map<
		C extends WorkableContext,
		T extends AbstractType,
		R extends Inheritable<C>,
	>(
		this: Workable<C, ArrayType<T>>,
		cb: (item: Actionable<C, T>, index: Actionable<C, NumberType>) => R,
	): Actionable<C, ArrayType<InheritableIntoType<C, R>>>;

	at<C extends WorkableContext, T extends AbstractType[], N extends number>(
		this: Workable<C, ArrayType<T>>,
		n: IntoWorkable<C, LiteralType<N>>,
	): Actionable<C, At<T, N>>;
	at<C extends WorkableContext, T extends AbstractType[]>(
		this: Workable<C, ArrayType<T>>,
		n: IntoWorkable<C, NumberType>,
	): Actionable<C, OptionType<UnionType<T>>>;
	at<C extends WorkableContext, T extends AbstractType, N extends number>(
		this: Workable<C, ArrayType<T>>,
		n: IntoWorkable<C, LiteralType<N>>,
	): Actionable<C, OptionType<T>>;
	at<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		n: IntoWorkable<C, NumberType>,
	): Actionable<C, OptionType<T>>;

	val<C extends WorkableContext, T extends AbstractType[]>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, OptionType<UnionType<T>>>;
	val<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, OptionType<T>>;

	len<C extends WorkableContext>(
		this: Workable<C, ArrayType>,
	): Actionable<C, NumberType>;
};

// Array functions which require overloading signatures

type ArrayMapElement<T extends AbstractType[] | AbstractType> =
	T extends AbstractType[] ? UnionType<T> : T extends AbstractType ? T : never;

function map<
	C extends WorkableContext,
	T extends AbstractType[],
	R extends Inheritable<C>,
>(
	this: Workable<C, ArrayType<T>>,
	cb: (
		item: Actionable<C, UnionType<T>>,
		index: Actionable<C, NumberType>,
	) => R,
): Actionable<C, ArrayType<InheritableIntoType<C, R>>>;
function map<
	C extends WorkableContext,
	T extends AbstractType,
	R extends Inheritable<C>,
>(
	this: Workable<C, ArrayType<T>>,
	cb: (item: Actionable<C, T>, index: Actionable<C, NumberType>) => R,
): Actionable<C, ArrayType<InheritableIntoType<C, R>>>;
function map<
	C extends WorkableContext,
	T extends AbstractType[] | AbstractType,
	R extends Inheritable<C>,
>(
	this: Workable<C, ArrayType<T>>,
	cb: (
		item: Actionable<C, ArrayMapElement<T>>,
		index: Actionable<C, NumberType>,
	) => R,
) {
	const item = actionable({
		[__ctx]: this[__ctx],
		[__type]: elementType(this[__type]),
		[__display]: () => "$item",
	}) as Actionable<C, ArrayMapElement<T>>;
	const index = actionable({
		[__ctx]: this[__ctx],
		[__type]: t.number(),
		[__display]: () => "$index",
	});
	const result = inheritableIntoWorkable(cb(item, index));

	return actionable({
		[__ctx]: this[__ctx],
		[__type]: t.array(result[__type]),
		[__display]: (ctx) =>
			`array::map(${this[__display](ctx)}, |$item, $index| ${result[__display](ctx)})`,
	});
}

function at<
	C extends WorkableContext,
	T extends AbstractType[],
	N extends number,
>(
	this: Workable<C, ArrayType<T>>,
	n: IntoWorkable<C, LiteralType<N>>,
): Actionable<C, At<T, N>>;
function at<C extends WorkableContext, T extends AbstractType>(
	this: Workable<C, ArrayType<T>>,
	n: IntoWorkable<C, NumberType>,
) {
	const v = intoWorkable(this[__ctx], t.number(), n);
	// `array::at` yields the element (or NONE when out of bounds), not the array,
	// so further field access resolves against the element type — see issue #36.
	const element = elementType(this[__type]);
	const type =
		element instanceof OptionType ? element : new OptionType(element);
	return databaseFunction(this[__ctx], type, "array::at", this, v);
}

function val<C extends WorkableContext, T extends AbstractType[]>(
	this: Workable<C, ArrayType<T>>,
): Actionable<C, OptionType<UnionType<T>>>;
function val<C extends WorkableContext, T extends AbstractType>(
	this: Workable<C, ArrayType<T>>,
): Actionable<C, OptionType<T>>;
function val<C extends WorkableContext, T extends AbstractType>(
	this: Workable<C, ArrayType<T>>,
) {
	// Call at() with literal 0 to get the first element
	// Type assertion is safe as we're calling the at() function with correct parameters
	type AtFunction = (
		this: Workable<C, ArrayType<T>>,
		n: IntoWorkable<C, LiteralType<0>>,
	) => unknown;
	return (at as AtFunction).call(
		this,
		intoWorkable(this[__ctx], t.literal(0), 0),
	);
}
