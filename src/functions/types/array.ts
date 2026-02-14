import {
	type AbstractType,
	type ArrayType,
	type BoolType,
	type LiteralType,
	type NumberType,
	type OptionType,
	type StringType,
	t,
	type UnionType,
} from "../../types";
import {
	__ctx,
	__type,
	type IntoWorkable,
	intoWorkable,
	type Workable,
	type WorkableContext,
} from "../../utils";
import type { Actionable } from "../../utils/actionable";
import type { At } from "../../utils/types";
import { comparingFilter } from "../filters";
import { databaseFunction } from "../utils";

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
		return databaseFunction(this[__ctx], this[__type], "array::pop", this);
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
	combine<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::combine",
			this,
			other,
		);
	},
	complement<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::complement",
			this,
			other,
		);
	},
	concat<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::concat",
			this,
			other,
		);
	},
	difference<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::difference",
			this,
			other,
		);
	},
	intersect<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::intersect",
			this,
			other,
		);
	},
	union<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::union",
			this,
			other,
		);
	},
	transpose<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::transpose",
			this,
			other,
		);
	},

	// Boolean array functions
	booleanAnd<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::boolean_and",
			this,
			other,
		);
	},
	booleanOr<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::boolean_or",
			this,
			other,
		);
	},
	booleanXor<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::boolean_xor",
			this,
			other,
		);
	},
	booleanNot<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::boolean_not",
			this,
		);
	},
	logicalAnd<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::logical_and",
			this,
			other,
		);
	},
	logicalOr<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::logical_or",
			this,
			other,
		);
	},
	logicalXor<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::logical_xor",
			this,
			other,
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
		v: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::filter_index",
			this,
			v,
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
		length: IntoWorkable<C, NumberType>,
	) {
		const s = intoWorkable(this[__ctx], t.number(), start);
		const l = intoWorkable(this[__ctx], t.number(), length);
		return databaseFunction(
			this[__ctx],
			this[__type],
			"array::slice",
			this,
			s,
			l,
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
	): Actionable<C, ArrayType<T>>;
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
	combine<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
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
		other: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;

	// Boolean array functions
	booleanAnd<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	booleanOr<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	booleanXor<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		other: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;
	booleanNot<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
	): Actionable<C, ArrayType<T>>;
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
		v: IntoWorkable<C>,
	): Actionable<C, ArrayType<T>>;

	// Other functions
	clump<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		size: IntoWorkable<C, NumberType>,
	): Actionable<C, ArrayType<T>>;
	arrayJoin<C extends WorkableContext>(
		this: Workable<C, ArrayType>,
		delimiter: IntoWorkable<C, StringType>,
	): Actionable<C, StringType>;
	slice<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		start: IntoWorkable<C, NumberType>,
		length: IntoWorkable<C, NumberType>,
	): Actionable<C, ArrayType<T>>;
	isEmpty<C extends WorkableContext>(
		this: Workable<C, ArrayType>,
	): Actionable<C, BoolType>;
	windows<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, ArrayType<T>>,
		size: IntoWorkable<C, NumberType>,
	): Actionable<C, ArrayType<T>>;

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
	return databaseFunction(this[__ctx], this[__type], "array::at", this, v);
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
