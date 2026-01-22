import {
	type AbstractType,
	type ArrayType,
	type BoolType,
	type LiteralType,
	type NumberType,
	type OptionType,
	type UnionType,
	t,
} from "../../types";
import {
	type IntoWorkable,
	type Workable,
	type WorkableContext,
	__ctx,
	__type,
	intoWorkable,
} from "../../utils";
import type { Actionable } from "../../utils/actionable";
import type { At } from "../../utils/types";
import { comparingFilter, joiningFilter, prefixedFilter } from "../filters";
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
	return (at as any).call(this, intoWorkable(this[__ctx], t.literal(0), 0));
}
