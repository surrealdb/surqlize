import type { Orm } from "../schema";
import {
	type AbstractType,
	type ArrayType,
	type BoolType,
	type LiteralType,
	type NumberType,
	type ObjectType,
	type ObjectTypeInner,
	type OptionType,
	type StringType,
	type UnionType,
	t,
} from "../types";
import {
	type IntoWorkable,
	type Workable,
	type WorkableContext,
	__ctx,
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
			return comparingFilter(this[__ctx], "=", this, v);
		},

		ne<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter(this[__ctx], "!=", this, v);
		},

		ex<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter(this[__ctx], "==", this, v);
		},

		// Fuzzy Matching
		fy<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter(this[__ctx], "~", this, v);
		},

		nf<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter(this[__ctx], "!~", this, v);
		},

		// Greater/Less
		gt<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter(this[__ctx], ">", this, v);
		},

		gte<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter(this[__ctx], ">=", this, v);
		},

		lt<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter(this[__ctx], "<", this, v);
		},

		lte<T extends AbstractType>(this: Workable<T>, v: IntoWorkable<T>) {
			return comparingFilter(this[__ctx], "<=", this, v);
		},

		// Inside
		inside<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<ArrayType<T>>,
		) {
			return comparingFilter(this[__ctx], "IN", this, v);
		},

		notInside<T extends AbstractType>(
			this: Workable<T>,
			v: IntoWorkable<ArrayType<T>>,
		) {
			return comparingFilter(this[__ctx], "NOT IN", this, v);
		},

		// Joining

		or(this: Workable, ...params: Workable[]) {
			return joiningFilter(this[__ctx], "OR", this, ...params);
		},

		and(this: Workable, ...params: Workable[]) {
			return joiningFilter(this[__ctx], "AND", this, ...params);
		},

		// Prefix

		not(this: Workable) {
			return prefixedFilter(this[__ctx], "!", this);
		},

		falseish(this: Workable) {
			return prefixedFilter(this[__ctx], "!", this);
		},

		trueish(this: Workable) {
			return prefixedFilter(this[__ctx], "!!", this);
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
			return databaseFunction(this[__ctx], t.number(), "array::len", this);
		},
	},
	string: {
		startsWith(this: Workable<StringType>, v: IntoWorkable<StringType>) {
			const val = intoWorkable(this[__ctx], t.string(), v);
			return databaseFunction(
				this[__ctx],
				t.bool(),
				"string::starts_with",
				this,
				val,
			);
		},
		endsWith(this: Workable<StringType>, v: IntoWorkable<StringType>) {
			const val = intoWorkable(this[__ctx], t.string(), v);
			return databaseFunction(
				this[__ctx],
				t.bool(),
				"string::ends_with",
				this,
				val,
			);
		},
		len(this: Workable<StringType>) {
			return databaseFunction(this[__ctx], t.number(), "string::len", this);
		},
		join(
			this: Workable<StringType>,
			separator: IntoWorkable<StringType>,
			...others: [IntoWorkable<StringType>, ...IntoWorkable<StringType>[]]
		) {
			const sep = intoWorkable(this[__ctx], t.string(), separator);
			const workables = others.map((p) =>
				intoWorkable(this[__ctx], t.string(), p),
			);
			return databaseFunction(
				this[__ctx],
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
				[__ctx]: this[__ctx],
				[__type]: this[__type].schema,
				[__display]: this[__display],
			});
			const res = cb(inner);
			return actionable({
				[__ctx]: this[__ctx],
				[__type]: t.option(res[__type]),
				[__display](ctx) {
					return `(${this[__display](ctx)}?${res[__display](ctx)})`;
				},
			});
		},
	},
	object: {
		extend<T extends ObjectTypeInner, R extends ObjectTypeInner>(
			this: Workable<ObjectType<T>>,
			cb: (arg: Actionable<ObjectType<T>>) => Workable<ObjectType<R>>,
		): Actionable<ObjectType<T & R>> {
			const inner = actionable(this);
			const res = cb(inner);
			const merged = { ...this[__type].schema, ...res[__type].schema };

			return actionable({
				[__ctx]: this[__ctx],
				[__type]: t.object(merged),
				[__display](ctx) {
					return `(${this[__display](ctx)}, ${res[__display](ctx)})`;
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
	ctx: WorkableContext,
	type: T,
	fn: string,
	...params: Workable[]
): Actionable<T> {
	return actionable({
		[__ctx]: ctx,
		[__type]: type,
		[__display](ctx) {
			const vars = params.map((p) => p[__display](ctx)).join(", ");
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
	return comparingFilter(this[__ctx], "CONTAINS", this, v);
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
	return comparingFilter(this[__ctx], "CONTAINSNOT", this, v);
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
	return comparingFilter(this[__ctx], "CONTAINSALL", this, v);
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
	return comparingFilter(this[__ctx], "CONTAINSANY", this, v);
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
	return comparingFilter(this[__ctx], "CONTAINSNONE", this, v);
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
	return comparingFilter(this[__ctx], "ALLINSIDE", this, v);
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
	return comparingFilter(this[__ctx], "ANYINSIDE", this, v);
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
	return comparingFilter(this[__ctx], "NONEINSIDE", this, v);
}

function at<T extends AbstractType[], N extends number>(
	this: Workable<ArrayType<T>>,
	n: IntoWorkable<LiteralType<N>>,
): Actionable<At<T, N>>;
function at(this: Workable, n: IntoWorkable<NumberType>) {
	const v = intoWorkable(this[__ctx], t.number(), n);
	return databaseFunction(this[__ctx], this[__type], "array::at", this, v);
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

	object: {
		extend<T extends ObjectTypeInner, R extends ObjectTypeInner>(
			this: Workable<ObjectType<T>>,
			cb: (arg: Actionable<ObjectType<T>>) => Workable<ObjectType<R>>,
		): Actionable<ObjectType<T & R>>;
	};
}
