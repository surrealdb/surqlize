import {
	type AbstractType,
	type ArrayType,
	type BoolType,
	type LiteralType,
	type NumberType,
	type OptionType,
	type StringType,
	type UnionType,
	t,
} from "../types";
import {
	type IntoWorkable,
	type Workable,
	__display,
	__type,
	intoWorkable,
} from "../utils";
import { type Actionable, actionable } from "../utils/actionable";
import type { At } from "../utils/types";
import { comparingFilter, joiningFilter, prefixedFilter } from "./filters";

export const __path: unique symbol = Symbol("path");

const functions: BaseFunctions = {
	any: {
		// Basic Comparison
		eq<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter("=", this, v);
		},

		ne<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter("!=", this, v);
		},

		ex<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter("==", this, v);
		},

		// Fuzzy Matching
		fy<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter("~", this, v);
		},

		nf<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter("!~", this, v);
		},

		// Greater/Less
		gt<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter(">", this, v);
		},

		gte<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter(">=", this, v);
		},

		lt<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter("<", this, v);
		},

		lte<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter("<=", this, v);
		},

		// Inside
		inside<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<ArrayType<T>>,
		) {
			return comparingFilter("IN", this, v);
		},

		notInside<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<ArrayType<T>>,
		) {
			return comparingFilter("NOT IN", this, v);
		},

		// Joining

		or(this: Workable, ...params: Workable[]) {
			return joiningFilter("OR", this, ...params);
		},

		and(this: Workable, ...params: Workable[]) {
			return joiningFilter("AND", this, ...params);
		},

		// Prefix

		not(this: Workable) {
			return prefixedFilter("!", this);
		},

		falseish(this: Workable) {
			return prefixedFilter("!", this);
		},

		trueish(this: Workable) {
			return prefixedFilter("!!", this);
		},
	},
	array: {
		contains,
		containsNot,
		containsAll,
		containsAny,
		containsNone,

		allInside,
		anyInside,
		noneInside,

		at,

		len(this: Workable<ArrayType>) {
			return databaseFunction(t.number(), "array::len", this);
		},
	},
	string: {
		startsWith(this: Workable<StringType>, v: IntoWorkable<StringType>) {
			const val = intoWorkable(t.string(), v);
			return databaseFunction(t.bool(), "string::starts_with", this, val);
		},
		endsWith(this: Workable<StringType>, v: IntoWorkable<StringType>) {
			const val = intoWorkable(t.string(), v);
			return databaseFunction(t.bool(), "string::ends_with", this, val);
		},
		len(this: Workable<StringType>) {
			return databaseFunction(t.number(), "string::len", this);
		},
		join(
			this: Workable<StringType>,
			separator: IntoWorkable<StringType>,
			...others: [IntoWorkable<StringType>, ...IntoWorkable<StringType>[]]
		) {
			const sep = intoWorkable(t.string(), separator);
			const workables = others.map((p) => intoWorkable(t.string(), p));
			return databaseFunction(
				t.string(),
				"string::join",
				sep,
				this,
				...workables,
			);
		},
	},
	option: {
		map<T extends AbstractType, R extends AbstractType>(
			this: Workable<OptionType<T>>,
			cb: (arg: Actionable<T>) => Workable<R>,
		) {
			const inner = actionable({
				[__type]: this[__type].schema,
				[__display]: this[__display],
			});
			const res = cb(inner);
			return actionable({
				[__type]: t.option(res[__type]),
				[__display](utils) {
					return `(${this[__display](utils)}?${res[__display](utils)})`;
				},
			});
		},
	},
};

export type GetFunctions<T extends AbstractType> = BaseFunctions["any"] &
	(T["name"] extends keyof BaseFunctions
		? BaseFunctions[T["name"]]
		: Record<string, (...args: IntoWorkable[]) => Actionable<AbstractType>>);

export function getFunctions<T extends AbstractType>(
	workable: Workable<T>,
): GetFunctions<T> {
	const fnc = { ...functions.any };

	if (workable[__type].name in functions) {
		Object.assign(fnc, functions[workable[__type].name as keyof BaseFunctions]);
	}

	for (const key in fnc) {
		type K = keyof typeof fnc;
		fnc[key as "eq"] = fnc[key as "eq"].bind(workable);
	}

	return fnc as GetFunctions<T>;
}

function databaseFunction<T extends AbstractType>(
	type: T,
	fn: string,
	...params: Workable[]
): Actionable<T> {
	return actionable({
		[__type]: type,
		[__display](utils) {
			const vars = params.map((p) => p[__display](utils)).join(", ");
			return `${fn}(${vars})`;
		},
	});
}

// Array functions which require overloading signatures

function contains<T extends AbstractType[]>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<UnionType<T>>,
): Actionable<BoolType>;
function contains<T extends AbstractType>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<T>,
): Actionable<BoolType>;
function contains(this: Workable, v: IntoWorkable) {
	return comparingFilter("CONTAINS", this, v);
}

function containsNot<T extends AbstractType[]>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<UnionType<T>>,
): Actionable<BoolType>;
function containsNot<T extends AbstractType>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<T>,
): Actionable<BoolType>;
function containsNot(this: Workable, v: IntoWorkable) {
	return comparingFilter("CONTAINSNOT", this, v);
}

function containsAll<T extends AbstractType[]>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<ArrayType<T>>,
): Actionable<BoolType>;
function containsAll<T extends AbstractType>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<ArrayType<T>>,
): Actionable<BoolType>;
function containsAll(this: Workable, v: IntoWorkable) {
	return comparingFilter("CONTAINSALL", this, v);
}

function containsAny<T extends AbstractType[]>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<ArrayType<T>>,
): Actionable<BoolType>;
function containsAny<T extends AbstractType>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<ArrayType<T>>,
): Actionable<BoolType>;
function containsAny(this: Workable, v: IntoWorkable) {
	return comparingFilter("CONTAINSANY", this, v);
}

function containsNone<T extends AbstractType[]>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<ArrayType<T>>,
): Actionable<BoolType>;
function containsNone<T extends AbstractType>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<ArrayType<T>>,
): Actionable<BoolType>;
function containsNone(this: Workable, v: IntoWorkable) {
	return comparingFilter("CONTAINSNONE", this, v);
}

function allInside<T extends AbstractType[]>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<ArrayType<T>>,
): Actionable<BoolType>;
function allInside<T extends AbstractType>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<ArrayType<T>>,
): Actionable<BoolType>;
function allInside(this: Workable, v: IntoWorkable) {
	return comparingFilter("ALLINSIDE", this, v);
}

function anyInside<T extends AbstractType[]>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<ArrayType<T>>,
): Actionable<BoolType>;
function anyInside<T extends AbstractType>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<ArrayType<T>>,
): Actionable<BoolType>;
function anyInside(this: Workable, v: IntoWorkable) {
	return comparingFilter("ANYINSIDE", this, v);
}

function noneInside<T extends AbstractType[]>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<ArrayType<T>>,
): Actionable<BoolType>;
function noneInside<T extends AbstractType>(
	this: Workable<ArrayType<T>>,
	v: IntoWorkable<ArrayType<T>>,
): Actionable<BoolType>;
function noneInside(this: Workable, v: IntoWorkable) {
	return comparingFilter("NONEINSIDE", this, v);
}

function at<T extends AbstractType[], N extends number>(
	this: Workable<ArrayType<T>>,
	n: IntoWorkable<LiteralType<N>>,
): Actionable<At<T, N>>;
function at(this: Workable, n: IntoWorkable<NumberType>) {
	const v = intoWorkable(t.number(), n);
	return databaseFunction(this[__type], "array::at", this, v);
}

interface BaseFunctions {
	any: {
		// Basic Comparison
		eq<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<T>,
		): Actionable<BoolType>;
		ne<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<T>,
		): Actionable<BoolType>;
		ex<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<T>,
		): Actionable<BoolType>;

		// Fuzzy Matching
		fy<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<T>,
		): Actionable<BoolType>;
		nf<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<T>,
		): Actionable<BoolType>;

		// Greater/Less
		gt<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<T>,
		): Actionable<BoolType>;
		gte<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<T>,
		): Actionable<BoolType>;
		lt<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<T>,
		): Actionable<BoolType>;
		lte<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<T>,
		): Actionable<BoolType>;

		// Inside
		inside<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<ArrayType<T>>,
		): Actionable<BoolType>;
		notInside<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<ArrayType<T>>,
		): Actionable<BoolType>;

		// Joining
		or(this: Workable, ...params: Workable[]): Actionable<BoolType>;
		and(this: Workable, ...params: Workable[]): Actionable<BoolType>;

		// Prefix
		not(this: Workable): Actionable<BoolType>;
		falseish(this: Workable): Actionable<BoolType>;
		trueish(this: Workable): Actionable<BoolType>;
	};

	array: {
		// Overloaded functions
		contains<T extends AbstractType[]>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<UnionType<T>>,
		): Actionable<BoolType>;
		contains<T extends AbstractType>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<T>,
		): Actionable<BoolType>;

		containsNot<T extends AbstractType[]>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<UnionType<T>>,
		): Actionable<BoolType>;
		containsNot<T extends AbstractType>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<T>,
		): Actionable<BoolType>;

		containsAll<T extends AbstractType[]>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<ArrayType<T>>,
		): Actionable<BoolType>;
		containsAll<T extends AbstractType>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<ArrayType<T>>,
		): Actionable<BoolType>;

		containsAny<T extends AbstractType[]>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<ArrayType<T>>,
		): Actionable<BoolType>;
		containsAny<T extends AbstractType>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<ArrayType<T>>,
		): Actionable<BoolType>;

		containsNone<T extends AbstractType[]>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<ArrayType<T>>,
		): Actionable<BoolType>;
		containsNone<T extends AbstractType>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<ArrayType<T>>,
		): Actionable<BoolType>;

		allInside<T extends AbstractType[]>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<ArrayType<T>>,
		): Actionable<BoolType>;
		allInside<T extends AbstractType>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<ArrayType<T>>,
		): Actionable<BoolType>;

		anyInside<T extends AbstractType[]>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<ArrayType<T>>,
		): Actionable<BoolType>;
		anyInside<T extends AbstractType>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<ArrayType<T>>,
		): Actionable<BoolType>;

		noneInside<T extends AbstractType[]>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<ArrayType<T>>,
		): Actionable<BoolType>;
		noneInside<T extends AbstractType>(
			this: Workable<ArrayType<T>>,
			v: IntoWorkable<ArrayType<T>>,
		): Actionable<BoolType>;

		at<T extends AbstractType[], N extends number>(
			this: Workable<ArrayType<T>>,
			n: IntoWorkable<LiteralType<N>>,
		): Actionable<At<T, N>>;
		at<T extends AbstractType[]>(
			this: Workable<ArrayType<T>>,
			n: IntoWorkable<NumberType>,
		): Actionable<OptionType<UnionType<T>>>;
		at<T extends AbstractType, N extends number>(
			this: Workable<ArrayType<T>>,
			n: IntoWorkable<LiteralType<N>>,
		): Actionable<OptionType<T>>;
		at<T extends AbstractType>(
			this: Workable<ArrayType<T>>,
			n: IntoWorkable<NumberType>,
		): Actionable<OptionType<T>>;

		len(this: Workable<ArrayType>): Actionable<NumberType>;
	};

	string: {
		startsWith(
			this: Workable<StringType>,
			v: IntoWorkable<StringType>,
		): Actionable<BoolType>;
		endsWith(
			this: Workable<StringType>,
			v: IntoWorkable<StringType>,
		): Actionable<BoolType>;
		len(this: Workable<StringType>): Actionable<NumberType>;
		join(
			this: Workable<StringType>,
			separator: IntoWorkable<StringType>,
			...others: [IntoWorkable<StringType>, ...IntoWorkable<StringType>[]]
		): Actionable<StringType>;
	};

	option: {
		map<T extends AbstractType, R extends AbstractType>(
			this: Workable<OptionType<T>>,
			cb: (arg: Actionable<T>) => Workable<R>,
		): Actionable<OptionType<R>>;
	};
}
