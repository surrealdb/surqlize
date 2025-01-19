import type { Orm } from "../schema";
import type { AbstractType } from "../types";
import type { DisplayUtils } from "./display";

export const __display: unique symbol = Symbol("display");
export const __type: unique symbol = Symbol("type");
export const __orm: unique symbol = Symbol("orm");

export type Workable<T extends AbstractType = AbstractType> = {
	[__display]: (utils: DisplayUtils) => string;
	[__type]: T;
	[__orm]: Orm;
};

export type IntoWorkable<T extends AbstractType = AbstractType> =
	| T["infer"]
	| Workable<T>;

export function intoWorkable<T extends AbstractType>(
	orm: Orm,
	type: T,
	value: T["infer"] | Workable<T>,
): Workable<T> {
	if (
		typeof value === "object" &&
		value !== null &&
		(value as Workable<T>)[__type] !== undefined
	) {
		return value as Workable<T>;
	}

	return {
		[__orm]: orm,
		[__display](utils: DisplayUtils) {
			const varname = utils.var(value);
			return `$${varname}`;
		},
		[__type]: type,
	};
}

export function workableGet(workable: Workable, key: string | number) {
	const [type, path] = workable[__type].get(key);

	return {
		[__orm]: workable[__orm],
		[__display](utils: DisplayUtils) {
			const parent = workable[__display](utils);
			return `${parent}${path}`;
		},
		[__type]: type,
	};
}

export function sanitizeWorkable<T extends AbstractType>(
	workable: Workable<T>,
): Workable<T> {
	return {
		[__orm]: workable[__orm],
		[__display]: workable[__display],
		[__type]: workable[__type],
	};
}
