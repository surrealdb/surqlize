import { type AbstractType, type OptionType, t } from "../../types";
import {
	__ctx,
	__display,
	__type,
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
		return actionable({
			[__ctx]: this[__ctx],
			[__type]: t.option(res[__type]),
			[__display](ctx) {
				return `(${this[__display](ctx)}?${res[__display](ctx)})`;
			},
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
};
