import {
	type AbstractType,
	type BoolType,
	type NumberType,
	OptionType,
	type SetType,
	type StringType,
	t,
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
import { comparingFilter } from "../filters";
import { databaseFunction } from "../utils";

/**
 * The `set::` function family, which SurrealDB keeps apart from `array::`.
 * Methods that exist for both follow SurrealDB's own `set::` signatures; the
 * array-only ones (`push`, `sort`, `insert`, …) are deliberately absent, as are
 * the closure-taking `all`/`any`/`filter`/`find` forms, `fold` and `reduce`.
 */
export const functions = {
	// Membership operators, which SurrealDB evaluates on sets as on arrays.
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
	allInside<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
		return comparingFilter(this[__ctx], "ALLINSIDE", this, v);
	},
	anyInside<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
		return comparingFilter(this[__ctx], "ANYINSIDE", this, v);
	},
	noneInside<C extends WorkableContext>(this: Workable<C>, v: IntoWorkable<C>) {
		return comparingFilter(this[__ctx], "NONEINSIDE", this, v);
	},

	// Producing a set
	add<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		v: IntoWorkable<C, T>,
	) {
		const x = intoWorkable(this[__ctx], this[__type].schema, v);
		return databaseFunction(this[__ctx], this[__type], "set::add", this, x);
	},
	remove<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		v: IntoWorkable<C, T>,
	) {
		const x = intoWorkable(this[__ctx], this[__type].schema, v);
		return databaseFunction(this[__ctx], this[__type], "set::remove", this, x);
	},
	complement<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		other: IntoWorkable<C, SetType<T>>,
	) {
		const o = intoWorkable(this[__ctx], this[__type], other);
		return databaseFunction(
			this[__ctx],
			this[__type],
			"set::complement",
			this,
			o,
		);
	},
	difference<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		other: IntoWorkable<C, SetType<T>>,
	) {
		const o = intoWorkable(this[__ctx], this[__type], other);
		return databaseFunction(
			this[__ctx],
			this[__type],
			"set::difference",
			this,
			o,
		);
	},
	intersect<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		other: IntoWorkable<C, SetType<T>>,
	) {
		const o = intoWorkable(this[__ctx], this[__type], other);
		return databaseFunction(
			this[__ctx],
			this[__type],
			"set::intersect",
			this,
			o,
		);
	},
	union<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		other: IntoWorkable<C, SetType<T>>,
	) {
		const o = intoWorkable(this[__ctx], this[__type], other);
		return databaseFunction(this[__ctx], this[__type], "set::union", this, o);
	},
	flatten<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
	) {
		return databaseFunction(this[__ctx], this[__type], "set::flatten", this);
	},
	filter<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		predicate: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			this[__type],
			"set::filter",
			this,
			predicate,
		);
	},
	slice<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		start?: IntoWorkable<C, NumberType>,
		end?: IntoWorkable<C, NumberType>,
	) {
		const args: Workable<C>[] = [this];
		if (start !== undefined)
			args.push(intoWorkable(this[__ctx], t.number(), start));
		if (end !== undefined)
			args.push(intoWorkable(this[__ctx], t.number(), end));
		return databaseFunction(
			this[__ctx],
			this[__type],
			"set::slice",
			...(args as [Workable<C>, ...Workable<C>[]]),
		);
	},
	map,

	// Reading from a set
	at,
	find<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		predicate: Workable<C>,
	) {
		return databaseFunction(
			this[__ctx],
			optional(this[__type].schema),
			"set::find",
			this,
			predicate,
		);
	},
	first<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			optional(this[__type].schema),
			"set::first",
			this,
		);
	},
	last<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			optional(this[__type].schema),
			"set::last",
			this,
		);
	},
	max<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			optional(this[__type].schema),
			"set::max",
			this,
		);
	},
	min<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
	) {
		return databaseFunction(
			this[__ctx],
			optional(this[__type].schema),
			"set::min",
			this,
		);
	},

	// Properties of a set
	isEmpty<C extends WorkableContext>(this: Workable<C, SetType>) {
		return databaseFunction(this[__ctx], t.bool(), "set::is_empty", this);
	},
	join<C extends WorkableContext>(
		this: Workable<C, SetType>,
		separator: IntoWorkable<C, StringType>,
	) {
		const s = intoWorkable(this[__ctx], t.string(), separator);
		return databaseFunction(this[__ctx], t.string(), "set::join", this, s);
	},
	len<C extends WorkableContext>(this: Workable<C, SetType>) {
		return databaseFunction(this[__ctx], t.number(), "set::len", this);
	},
	all<C extends WorkableContext>(this: Workable<C, SetType>, p?: Workable<C>) {
		return databaseFunction(
			this[__ctx],
			t.bool(),
			"set::all",
			...(p ? [this, p] : [this]),
		);
	},
	any<C extends WorkableContext>(this: Workable<C, SetType>, p?: Workable<C>) {
		return databaseFunction(
			this[__ctx],
			t.bool(),
			"set::any",
			...(p ? [this, p] : [this]),
		);
	},
} satisfies Functions;

export type Functions = {
	contains<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		v: IntoWorkable<C, T>,
	): Actionable<C, BoolType>;
	containsNot<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		v: IntoWorkable<C, T>,
	): Actionable<C, BoolType>;
	containsAll<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		v: IntoWorkable<C, SetType<T>>,
	): Actionable<C, BoolType>;
	containsAny<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		v: IntoWorkable<C, SetType<T>>,
	): Actionable<C, BoolType>;
	containsNone<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		v: IntoWorkable<C, SetType<T>>,
	): Actionable<C, BoolType>;
	allInside<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		v: IntoWorkable<C, SetType<T>>,
	): Actionable<C, BoolType>;
	anyInside<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		v: IntoWorkable<C, SetType<T>>,
	): Actionable<C, BoolType>;
	noneInside<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		v: IntoWorkable<C, SetType<T>>,
	): Actionable<C, BoolType>;

	add<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		v: IntoWorkable<C, T>,
	): Actionable<C, SetType<T>>;
	remove<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		v: IntoWorkable<C, T>,
	): Actionable<C, SetType<T>>;
	complement<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		other: IntoWorkable<C, SetType<T>>,
	): Actionable<C, SetType<T>>;
	difference<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		other: IntoWorkable<C, SetType<T>>,
	): Actionable<C, SetType<T>>;
	intersect<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		other: IntoWorkable<C, SetType<T>>,
	): Actionable<C, SetType<T>>;
	union<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		other: IntoWorkable<C, SetType<T>>,
	): Actionable<C, SetType<T>>;
	flatten<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
	): Actionable<C, SetType<T>>;
	filter<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		predicate: IntoWorkable<C>,
	): Actionable<C, SetType<T>>;
	slice<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		start?: IntoWorkable<C, NumberType>,
		end?: IntoWorkable<C, NumberType>,
	): Actionable<C, SetType<T>>;
	map<
		C extends WorkableContext,
		T extends AbstractType,
		R extends Inheritable<C>,
	>(
		this: Workable<C, SetType<T>>,
		cb: (item: Actionable<C, T>, index: Actionable<C, NumberType>) => R,
	): Actionable<C, SetType<InheritableIntoType<C, R>>>;

	at<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		n: IntoWorkable<C, NumberType>,
	): Actionable<C, OptionType<T>>;
	find<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
		predicate: IntoWorkable<C>,
	): Actionable<C, OptionType<T>>;
	first<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
	): Actionable<C, OptionType<T>>;
	last<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
	): Actionable<C, OptionType<T>>;
	max<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
	): Actionable<C, OptionType<T>>;
	min<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, SetType<T>>,
	): Actionable<C, OptionType<T>>;

	isEmpty<C extends WorkableContext>(
		this: Workable<C, SetType>,
	): Actionable<C, BoolType>;
	join<C extends WorkableContext>(
		this: Workable<C, SetType>,
		separator: IntoWorkable<C, StringType>,
	): Actionable<C, StringType>;
	len<C extends WorkableContext>(
		this: Workable<C, SetType>,
	): Actionable<C, NumberType>;
	all<C extends WorkableContext>(
		this: Workable<C, SetType>,
		predicate?: IntoWorkable<C>,
	): Actionable<C, BoolType>;
	any<C extends WorkableContext>(
		this: Workable<C, SetType>,
		predicate?: IntoWorkable<C>,
	): Actionable<C, BoolType>;
};

/** `set::first` and friends yield NONE for an empty set. */
function optional<T extends AbstractType>(element: T): OptionType<T> {
	return (
		element instanceof OptionType ? element : new OptionType(element)
	) as OptionType<T>;
}

function map<
	C extends WorkableContext,
	T extends AbstractType,
	R extends Inheritable<C>,
>(
	this: Workable<C, SetType<T>>,
	cb: (item: Actionable<C, T>, index: Actionable<C, NumberType>) => R,
) {
	const item = actionable({
		[__ctx]: this[__ctx],
		[__type]: this[__type].schema,
		[__display]: () => "$item",
	}) as Actionable<C, T>;
	const index = actionable({
		[__ctx]: this[__ctx],
		[__type]: t.number(),
		[__display]: () => "$index",
	});
	const result = inheritableIntoWorkable(cb(item, index));

	return actionable({
		[__ctx]: this[__ctx],
		[__type]: t.set(result[__type]),
		[__display]: (ctx) =>
			`set::map(${this[__display](ctx)}, |$item, $index| ${result[__display](ctx)})`,
	}) as Actionable<C, SetType<InheritableIntoType<C, R>>>;
}

function at<C extends WorkableContext, T extends AbstractType>(
	this: Workable<C, SetType<T>>,
	n: IntoWorkable<C, NumberType>,
) {
	const v = intoWorkable(this[__ctx], t.number(), n);
	return databaseFunction(
		this[__ctx],
		optional(this[__type].schema),
		"set::at",
		this,
		v,
	);
}
