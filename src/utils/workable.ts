import type { Orm } from "../schema";
import type { AbstractType } from "../types";
import type { DisplayContext } from "./display";

export const __display: unique symbol = Symbol("display");
export const __type: unique symbol = Symbol("type");
export const __ctx: unique symbol = Symbol("ctx");

export type Workable<T extends AbstractType = AbstractType> = {
	[__display]: (ctx: DisplayContext) => string;
	[__type]: T;
	[__ctx]: WorkableContext;
};

export type WorkableContext<O extends Orm = Orm> = {
	orm: O;
	id: symbol;
};

export type IntoWorkable<T extends AbstractType = AbstractType> =
	| T["infer"]
	| Workable<T>;

export function intoWorkable<T extends AbstractType>(
	ctx: WorkableContext,
	type: T,
	value: T["infer"] | Workable<T>,
): Workable<T> {
	if (isWorkable(value)) {
		return value as Workable<T>;
	}

	return {
		[__ctx]: ctx,
		[__display](ctx: DisplayContext) {
			return ctx.var(value);
		},
		[__type]: type,
	};
}

export function workableGet(workable: Workable, key: string | number) {
	const [type, path] = workable[__type].get(key);

	return {
		[__ctx]: workable[__ctx],
		[__display](ctx: DisplayContext) {
			const parent = workable[__display](ctx);
			return `${parent}${path}`;
		},
		[__type]: type,
	};
}

export function sanitizeWorkable<T extends AbstractType>(
	workable: Workable<T>,
): Workable<T> {
	return {
		[__ctx]: workable[__ctx],
		[__display]: workable[__display],
		[__type]: workable[__type],
	};
}

export function isWorkable(value: unknown): value is Workable {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as Workable)[__ctx] !== undefined
	);
}
