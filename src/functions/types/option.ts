import {
	type AbstractType,
	type BoolType,
	type OptionType,
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

export const functions = {
	map<
		C extends WorkableContext,
		T extends AbstractType,
		R extends AbstractType,
	>(
		this: Workable<C, OptionType<T>>,
		cb: (arg: Actionable<C, T>) => Workable<C, R>,
	) {
		const inner = actionable({
			[__ctx]: this[__ctx],
			[__type]: this[__type].schema,
			[__display]: this[__display],
		});
		const res = cb(inner);
		// NB: arrow display — a method-shorthand `[__display](ctx){}` would rebind
		// `this` to the new workable and recurse on `this[__display]`.
		return actionable({
			[__ctx]: this[__ctx],
			[__type]: t.option(res[__type]),
			[__display]: (ctx) => `(${this[__display](ctx)}?${res[__display](ctx)})`,
		});
	},

	/**
	 * Treat the value as its non-optional inner type, exposing the inner type's
	 * fields and methods for chaining. SurrealDB dereferences a `NONE` to `NONE`
	 * transparently, so this is an identity on the rendered path — it only sheds
	 * the `option<…>` wrapper at the type level (the query stays NONE-safe). Use
	 * it to call inner methods that the `option` itself doesn't expose, e.g.
	 * `tags.unwrap().at(0)` or `link.unwrap().select()`.
	 */
	unwrap<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, OptionType<T>>,
	) {
		return actionable({
			[__ctx]: this[__ctx],
			[__type]: this[__type].schema,
			[__display]: this[__display],
		});
	},

	/**
	 * Supply a fallback for when the value is absent: renders `(<value> ?? <fallback>)`
	 * using SurrealDB's null-coalescing operator, yielding the non-optional inner
	 * type. The Rust `Option::unwrap_or` equivalent (`unwrap_or_else` collapses to
	 * this too — a query fallback is just an expression, with no laziness).
	 */
	unwrapOr<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, OptionType<T>>,
		fallback: IntoWorkable<C, T>,
	) {
		const value = intoWorkable(this[__ctx], this[__type].schema, fallback);
		return actionable({
			[__ctx]: this[__ctx],
			[__type]: this[__type].schema,
			[__display]: (ctx) =>
				`(${this[__display](ctx)} ?? ${value[__display](ctx)})`,
		});
	},

	/** `<value> IS NONE` — true when the value is absent. */
	isNone<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, OptionType<T>>,
	) {
		return actionable({
			[__ctx]: this[__ctx],
			[__type]: t.bool(),
			[__display]: (ctx) => `${this[__display](ctx)} IS NONE`,
		});
	},

	/** `<value> IS NOT NONE` — true when the value is present. */
	isSome<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, OptionType<T>>,
	) {
		return actionable({
			[__ctx]: this[__ctx],
			[__type]: t.bool(),
			[__display]: (ctx) => `${this[__display](ctx)} IS NOT NONE`,
		});
	},

	/**
	 * Present *and* the inner value satisfies `cb` — renders
	 * `(<value> IS NOT NONE AND <cb(inner)>)`. The Rust `Option::is_some_and`
	 * equivalent; the callback receives the unwrapped inner value.
	 */
	isSomeAnd<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, OptionType<T>>,
		cb: (value: Actionable<C, T>) => Workable<C, BoolType>,
	) {
		const inner = actionable({
			[__ctx]: this[__ctx],
			[__type]: this[__type].schema,
			[__display]: this[__display],
		});
		const pred = cb(inner);
		return actionable({
			[__ctx]: this[__ctx],
			[__type]: t.bool(),
			[__display]: (ctx) =>
				`(${this[__display](ctx)} IS NOT NONE AND ${pred[__display](ctx)})`,
		});
	},
} satisfies Functions;

export type Functions = {
	map<
		C extends WorkableContext,
		T extends AbstractType,
		R extends AbstractType,
	>(
		this: Workable<C, OptionType<T>>,
		cb: (arg: Actionable<C, T>) => Workable<C, R>,
	): Actionable<C, OptionType<R>>;

	unwrap<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, OptionType<T>>,
	): Actionable<C, T>;

	unwrapOr<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, OptionType<T>>,
		fallback: IntoWorkable<C, T>,
	): Actionable<C, T>;

	isNone<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, OptionType<T>>,
	): Actionable<C, BoolType>;

	isSome<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, OptionType<T>>,
	): Actionable<C, BoolType>;

	isSomeAnd<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, OptionType<T>>,
		cb: (value: Actionable<C, T>) => Workable<C, BoolType>,
	): Actionable<C, BoolType>;
};
