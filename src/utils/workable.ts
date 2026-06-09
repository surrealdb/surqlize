import type { Orm } from "../schema";
import { type AbstractType, ArrayType, GraphType } from "../types";
import type { DisplayContext } from "./display";

export const __display: unique symbol = Symbol("display");
export const __type: unique symbol = Symbol("type");
export const __ctx: unique symbol = Symbol("ctx");

export type Workable<
	C extends WorkableContext = WorkableContext,
	T extends AbstractType = AbstractType,
> = {
	[__display]: (ctx: DisplayContext) => string;
	[__type]: T;
	[__ctx]: C;
};

// biome-ignore lint/suspicious/noExplicitAny: default context must accept any typed ORM instance
export type WorkableContext<O extends Orm<any> = Orm<any>> = {
	orm: O;
	id: symbol;
};

export type IntoWorkable<
	C extends WorkableContext,
	T extends AbstractType = AbstractType,
> = T["infer"] | Workable<C, T>;

export function intoWorkable<C extends WorkableContext, T extends AbstractType>(
	ctx: C,
	type: T,
	value: T["infer"] | Workable<C, T>,
): Workable<C, T> {
	if (isWorkable(value)) {
		return value as Workable<C, T>;
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
	let [type, path] = workable[__type].get(key);

	if (workable[__type] instanceof GraphType && workable[__type].tb !== "*") {
		const table = workable[__ctx].orm.tables[workable[__type].tb];
		const schema = table?.schema;
		if (schema) {
			const [fieldType, fieldPath] = schema.get(key);
			type = new ArrayType(fieldType);
			path = fieldPath;
		}
	}

	return {
		[__ctx]: workable[__ctx],
		[__display](ctx: DisplayContext) {
			const parent = workable[__display](ctx);
			return `${parent}${path}`;
		},
		[__type]: type,
	};
}

export function sanitizeWorkable<
	C extends WorkableContext,
	T extends AbstractType,
>(workable: Workable<C, T>): Workable<C, T> {
	return {
		[__ctx]: workable[__ctx],
		[__display]: workable[__display],
		[__type]: workable[__type],
	};
}

export function isWorkable<C extends WorkableContext>(
	value: unknown,
): value is Workable<C> {
	return (
		(typeof value === "object" || typeof value === "function") &&
		value !== null &&
		(value as Workable<C>)[__ctx] !== undefined
	);
}
