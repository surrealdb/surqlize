import type { SelectOneQuery } from "../query/select";
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
	type RecordType,
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
		eq<C extends WorkableContext, T extends AbstractType>(this: Workable<C, T>, v: IntoWorkable<C, T>) {
			return comparingFilter(this[__ctx], "=", this, v);
		},

		ne<C extends WorkableContext, T extends AbstractType>(this: Workable<C, T>, v: IntoWorkable<C, T>) {
			return comparingFilter(this[__ctx], "!=", this, v);
		},

		ex<C extends WorkableContext, T extends AbstractType>(this: Workable<C, T>, v: IntoWorkable<C, T>) {
			return comparingFilter(this[__ctx], "==", this, v);
		},

		// Fuzzy Matching
		fy<C extends WorkableContext, T extends AbstractType>(this: Workable<C, T>, v: IntoWorkable<C, T>) {
			return comparingFilter(this[__ctx], "~", this, v);
		},

		nf<C extends WorkableContext, T extends AbstractType>(this: Workable<C, T>, v: IntoWorkable<C, T>) {
			return comparingFilter(this[__ctx], "!~", this, v);
		},

		// Greater/Less
		gt<C extends WorkableContext, T extends AbstractType>(this: Workable<C, T>, v: IntoWorkable<C, T>) {
			return comparingFilter(this[__ctx], ">", this, v);
		},

		gte<C extends WorkableContext, T extends AbstractType>(this: Workable<C, T>, v: IntoWorkable<C, T>) {
			return comparingFilter(this[__ctx], ">=", this, v);
		},

		lt<C extends WorkableContext, T extends AbstractType>(this: Workable<C, T>, v: IntoWorkable<C, T>) {
			return comparingFilter(this[__ctx], "<", this, v);
		},

		lte<C extends WorkableContext, T extends AbstractType>(this: Workable<C, T>, v: IntoWorkable<C, T>) {
			return comparingFilter(this[__ctx], "<=", this, v);
		},

		// Inside
		inside<C extends WorkableContext, T extends AbstractType>(
			this: Workable<C, T>,
			v: IntoWorkable<C, ArrayType<T>>,
		) {
			return comparingFilter(this[__ctx], "IN", this, v);
		},

		notInside<C extends WorkableContext, T extends AbstractType>(
			this: Workable<C, T>,
			v: IntoWorkable<C, ArrayType<T>>,
		) {
			return comparingFilter(this[__ctx], "NOT IN", this, v);
		},

		// Joining

		or<C extends WorkableContext>(this: Workable<C>, ...params: Workable<C>[]) {
			return joiningFilter(this[__ctx], "OR", this, ...params);
		},

		and<C extends WorkableContext>(this: Workable<C>, ...params: Workable<C>[]) {
			return joiningFilter(this[__ctx], "AND", this, ...params);
		},

		// Prefix

		not<C extends WorkableContext>(this: Workable<C>) {
			return prefixedFilter(this[__ctx], "!", this);
		},

		falseish<C extends WorkableContext>(this: Workable<C>) {
			return prefixedFilter(this[__ctx], "!", this);
		},

		trueish<C extends WorkableContext>(this: Workable<C>) {
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

		len<C extends WorkableContext>(this: Workable<C, ArrayType>) {
			return databaseFunction(this[__ctx], t.number(), "array::len", this);
		},
	},
	string: {
		startsWith<C extends WorkableContext>(this: Workable<C, StringType>, v: IntoWorkable<C, StringType>) {
			const val = intoWorkable(this[__ctx], t.string(), v);
			return databaseFunction(
				this[__ctx],
				t.bool(),
				"string::starts_with",
				this,
				val,
			);
		},
		endsWith<C extends WorkableContext>(this: Workable<C, StringType>, v: IntoWorkable<C, StringType>) {
			const val = intoWorkable(this[__ctx], t.string(), v);
			return databaseFunction(
				this[__ctx],
				t.bool(),
				"string::ends_with",
				this,
				val,
			);
		},
		len<C extends WorkableContext>(this: Workable<C, StringType>) {
			return databaseFunction(this[__ctx], t.number(), "string::len", this);
		},
		join<C extends WorkableContext>(
			this: Workable<C, StringType>,
			separator: IntoWorkable<C, StringType>,
			...others: [IntoWorkable<C, StringType>, ...IntoWorkable<C, StringType>[]]
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
		map<C extends WorkableContext, T extends AbstractType, R extends AbstractType>(
			this: Workable<C, OptionType<T>>,
			cb: (arg: Actionable<C, T>) => Workable<C, R>,
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
		extend<C extends WorkableContext, T extends ObjectTypeInner, R extends ObjectTypeInner>(
			this: Workable<C, ObjectType<T>>,
			cb: (arg: Actionable<C, ObjectType<T>>) => Workable<C, ObjectType<R>>,
		): Actionable<C, ObjectType<T & R>> {
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
	record: {
		select<O extends Orm, C extends WorkableContext<O>, Tb extends keyof O["tables"] & string>(this: Workable<C, RecordType<Tb>>) {
			return this[__ctx].orm.select(this);
		}
	},
};

export type GetFunctions<C extends WorkableContext, T extends AbstractType> = BaseFunctions["any"] &
	(T["name"] extends keyof BaseFunctions
		? BaseFunctions[T["name"]]
		: Record<string, (...args: IntoWorkable<C>[]) => Actionable<C, AbstractType>>);

export function getFunctions<C extends WorkableContext, T extends AbstractType>(
	workable: Workable<C, T>,
): GetFunctions<C, T> {
	const fnc = { ...functions.any };

	if (workable[__type].name in functions) {
		Object.assign(fnc, functions[workable[__type].name as keyof BaseFunctions]);
	}

	for (const key in fnc) {
		fnc[key as "eq"] = fnc[key as "eq"].bind(workable) as (typeof fnc)['eq'];
	}

	return fnc as GetFunctions<C, T>;
}

function databaseFunction<C extends WorkableContext, T extends AbstractType>(
	ctx: C,
	type: T,
	fn: string,
	...params: Workable<C>[]
): Actionable<C, T> {
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

function contains<C extends WorkableContext, T extends AbstractType<C>[]>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, UnionType<T>>,
): Actionable<C, BoolType>;
function contains<C extends WorkableContext, T extends AbstractType<C>>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, T>,
): Actionable<C, BoolType>;
function contains<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
	return comparingFilter(this[__ctx], "CONTAINS", this, v);
}

function containsNot<C extends WorkableContext, T extends AbstractType<C>[]>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, UnionType<T>>,
): Actionable<C, BoolType>;
function containsNot<C extends WorkableContext, T extends AbstractType<C>>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, T>,
): Actionable<C, BoolType>;
function containsNot<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
	return comparingFilter(this[__ctx], "CONTAINSNOT", this, v);
}

function containsAll<C extends WorkableContext, T extends AbstractType<C>[]>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, ArrayType<T>>,
): Actionable<C, BoolType>;
function containsAll<C extends WorkableContext, T extends AbstractType<C>>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, ArrayType<T>>,
): Actionable<C, BoolType>;
function containsAll<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
	return comparingFilter(this[__ctx], "CONTAINSALL", this, v);
}

function containsAny<C extends WorkableContext, T extends AbstractType<C>[]>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, ArrayType<T>>,
): Actionable<C, BoolType>;
function containsAny<C extends WorkableContext, T extends AbstractType<C>>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, ArrayType<T>>,
): Actionable<C, BoolType>;
function containsAny<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
	return comparingFilter(this[__ctx], "CONTAINSANY", this, v);
}

function containsNone<C extends WorkableContext, T extends AbstractType<C>[]>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, ArrayType<T>>,
): Actionable<C, BoolType>;
function containsNone<C extends WorkableContext, T extends AbstractType<C>>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, ArrayType<T>>,
): Actionable<C, BoolType>;
function containsNone<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
	return comparingFilter(this[__ctx], "CONTAINSNONE", this, v);
}

function allInside<C extends WorkableContext, T extends AbstractType<C>[]>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, ArrayType<T>>,
): Actionable<C, BoolType>;
function allInside<C extends WorkableContext, T extends AbstractType<C>>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, ArrayType<T>>,
): Actionable<C, BoolType>;
function allInside<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
	return comparingFilter(this[__ctx], "ALLINSIDE", this, v);
}

function anyInside<C extends WorkableContext, T extends AbstractType<C>[]>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, ArrayType<T>>,
): Actionable<C, BoolType>;
function anyInside<C extends WorkableContext, T extends AbstractType<C>>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, ArrayType<T>>,
): Actionable<C, BoolType>;
function anyInside<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
	return comparingFilter(this[__ctx], "ANYINSIDE", this, v);
}

function noneInside<C extends WorkableContext, T extends AbstractType<C>[]>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, ArrayType<T>>,
): Actionable<C, BoolType>;
function noneInside<C extends WorkableContext, T extends AbstractType<C>>(
	this: Workable<C, ArrayType<T>>,
	v: IntoWorkable<C, ArrayType<T>>,
): Actionable<C, BoolType>;
function noneInside<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
	return comparingFilter(this[__ctx], "NONEINSIDE", this, v);
}

function at<C extends WorkableContext, T extends AbstractType[], N extends number>(
	this: Workable<C, ArrayType<T>>,
	n: IntoWorkable<C, LiteralType<N>>,
): Actionable<C, At<T, N>>;
function at<C extends WorkableContext>(this: Workable, n: IntoWorkable<C, NumberType>) {
	const v = intoWorkable(this[__ctx], t.number(), n);
	return databaseFunction(this[__ctx], this[__type], "array::at", this, v);
}

interface BaseFunctions {
	any: {
		// Basic Comparison
		eq<C extends WorkableContext, T extends AbstractType>(
			this: Workable<C, T>,
			v: IntoWorkable<C, T>,
		): Actionable<C, BoolType>;
		ne<C extends WorkableContext, T extends AbstractType>(
			this: Workable<C, T>,
			v: IntoWorkable<C, T>,
		): Actionable<C, BoolType>;
		ex<C extends WorkableContext, T extends AbstractType>(
			this: Workable<C, T>,
			v: IntoWorkable<C, T>,
		): Actionable<C, BoolType>;

		// Fuzzy Matching
		fy<C extends WorkableContext, T extends AbstractType>(
			this: Workable<C, T>,
			v: IntoWorkable<C, T>,
		): Actionable<C, BoolType>;
		nf<C extends WorkableContext, T extends AbstractType>(
			this: Workable<C, T>,
			v: IntoWorkable<C, T>,
		): Actionable<C, BoolType>;

		// Greater/Less
		gt<C extends WorkableContext, T extends AbstractType>(
			this: Workable<C, T>,
			v: IntoWorkable<C, T>,
		): Actionable<C, BoolType>;
		gte<C extends WorkableContext, T extends AbstractType>(
			this: Workable<C, T>,
			v: IntoWorkable<C, T>,
		): Actionable<C, BoolType>;
		lt<C extends WorkableContext, T extends AbstractType>(
			this: Workable<C, T>,
			v: IntoWorkable<C, T>,
		): Actionable<C, BoolType>;
		lte<C extends WorkableContext, T extends AbstractType>(
			this: Workable<C, T>,
			v: IntoWorkable<C, T>,
		): Actionable<C, BoolType>;

		// Inside
		inside<C extends WorkableContext, T extends AbstractType>(
			this: Workable<C, T>,
			v: IntoWorkable<C, ArrayType<T>>,
		): Actionable<C, BoolType>;
		notInside<C extends WorkableContext, T extends AbstractType>(
			this: Workable<C, T>,
			v: IntoWorkable<C, ArrayType<T>>,
		): Actionable<C, BoolType>;

		// Joining
		or<C extends WorkableContext>(this: Workable<C>, ...params: Workable<C>[]): Actionable<C, BoolType>;
		and<C extends WorkableContext>(this: Workable<C>, ...params: Workable<C>[]): Actionable<C, BoolType>;

		// Prefix
		not<C extends WorkableContext>(this: Workable<C>): Actionable<C, BoolType>;
		falseish<C extends WorkableContext>(this: Workable<C>): Actionable<C, BoolType>;
		trueish<C extends WorkableContext>(this: Workable<C>): Actionable<C, BoolType>;
	};

	array: {
		// Overloaded functions
		contains<C extends WorkableContext, T extends AbstractType<C>[]>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, UnionType<T>>,
		): Actionable<C, BoolType>;
		contains<C extends WorkableContext, T extends AbstractType<C>>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, T>,
		): Actionable<C, BoolType>;

		containsNot<C extends WorkableContext, T extends AbstractType<C>[]>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, UnionType<T>>,
		): Actionable<C, BoolType>;
		containsNot<C extends WorkableContext, T extends AbstractType<C>>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, T>,
		): Actionable<C, BoolType>;

		containsAll<C extends WorkableContext, T extends AbstractType<C>[]>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, ArrayType<T>>,
		): Actionable<C, BoolType>;
		containsAll<C extends WorkableContext, T extends AbstractType<C>>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, ArrayType<T>>,
		): Actionable<C, BoolType>;

		containsAny<C extends WorkableContext, T extends AbstractType<C>[]>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, ArrayType<T>>,
		): Actionable<C, BoolType>;
		containsAny<C extends WorkableContext, T extends AbstractType<C>>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, ArrayType<T>>,
		): Actionable<C, BoolType>;

		containsNone<C extends WorkableContext, T extends AbstractType<C>[]>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, ArrayType<T>>,
		): Actionable<C, BoolType>;
		containsNone<C extends WorkableContext, T extends AbstractType<C>>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, ArrayType<T>>,
		): Actionable<C, BoolType>;

		allInside<C extends WorkableContext, T extends AbstractType<C>[]>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, ArrayType<T>>,
		): Actionable<C, BoolType>;
		allInside<C extends WorkableContext, T extends AbstractType<C>>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, ArrayType<T>>,
		): Actionable<C, BoolType>;

		anyInside<C extends WorkableContext, T extends AbstractType<C>[]>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, ArrayType<T>>,
		): Actionable<C, BoolType>;
		anyInside<C extends WorkableContext, T extends AbstractType<C>>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, ArrayType<T>>,
		): Actionable<C, BoolType>;

		noneInside<C extends WorkableContext, T extends AbstractType<C>[]>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, ArrayType<T>>,
		): Actionable<C, BoolType>;
		noneInside<C extends WorkableContext, T extends AbstractType<C>>(
			this: Workable<C, ArrayType<T>>,
			v: IntoWorkable<C, ArrayType<T>>,
		): Actionable<C, BoolType>;

		at<C extends WorkableContext, T extends AbstractType<C>[], N extends number>(
			this: Workable<C, ArrayType<T>>,
			n: IntoWorkable<C, LiteralType<N>>,
		): Actionable<C, At<T, N>>;
		at<C extends WorkableContext, T extends AbstractType<C>[]>(
			this: Workable<C, ArrayType<T>>,
			n: IntoWorkable<C, NumberType>,
		): Actionable<C, OptionType<UnionType<T>>>;
		at<C extends WorkableContext, T extends AbstractType<C>, N extends number>(
			this: Workable<C, ArrayType<T>>,
			n: IntoWorkable<C, LiteralType<N>>,
		): Actionable<C, OptionType<T>>;
		at<C extends WorkableContext, T extends AbstractType<C>>(
			this: Workable<C, ArrayType<T>>,
			n: IntoWorkable<C, NumberType>,
		): Actionable<C, OptionType<T>>;

		len<C extends WorkableContext>(this: Workable<C, ArrayType>): Actionable<C, NumberType>;
	};

	string: {
		startsWith<C extends WorkableContext>(
			this: Workable<C, StringType>,
			v: IntoWorkable<C, StringType>,
		): Actionable<C, BoolType>;
		endsWith<C extends WorkableContext>(
			this: Workable<C, StringType>,
			v: IntoWorkable<C, StringType>,
		): Actionable<C, BoolType>;
		len<C extends WorkableContext>(this: Workable<C, StringType>): Actionable<C, NumberType>;
		join<C extends WorkableContext>(
			this: Workable<C, StringType>,
			separator: IntoWorkable<C, StringType>,
			...others: [IntoWorkable<C, StringType>, ...IntoWorkable<C, StringType>[]]
		): Actionable<C, StringType>;
	};

	option: {
		map<C extends WorkableContext, T extends AbstractType<C>, R extends AbstractType<C>>(
			this: Workable<C, OptionType<T>>,
			cb: (arg: Actionable<C, T>) => Workable<C, R>,
		): Actionable<C, OptionType<R>>;
	};

	object: {
		extend<C extends WorkableContext, T extends ObjectTypeInner, R extends ObjectTypeInner>(
			this: Workable<C, ObjectType<T>>,
			cb: (arg: Actionable<C, ObjectType<T>>) => Workable<C, ObjectType<R>>,
		): Actionable<C, ObjectType<T & R>>;
	};

	record: {
		select<O extends Orm, C extends WorkableContext<O>, Tb extends keyof O["tables"] & string>(
			this: Workable<C, RecordType<Tb>>,
		): SelectOneQuery<O, C, Tb>;
	};
}
