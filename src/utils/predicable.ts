import {
	type AbstractType,
	type ArrayType,
	ObjectType,
	StringType,
} from "../types";
import type { DisplayContext } from "./display";
import {
	type Workable,
	type WorkableContext,
	__display,
	__type,
	isWorkable,
} from "./workable";

export type PredicableObject<C extends WorkableContext> = {
	[key: string]: Predicable<C>;
};

export type Predicable<C extends WorkableContext> =
	| Workable<C>
	| PredicableObject<C>;

export type PredicableIntoType<
	C extends WorkableContext,
	T extends Predicable<C>,
> = T extends Workable<C, infer U>
	? U
	: T extends PredicableObject<C>
		? ObjectType<{ [K in keyof T]: PredicableIntoType<C, T[K]> }>
		: never;

export type PredicableIntoWorkable<
	C extends WorkableContext,
	P extends Predicable<C>,
> = P extends Workable<C, infer T>
	? Workable<C, T>
	: P extends PredicableObject<C>
		? Workable<C, PredicableIntoType<C, P>>
		: never;

export function predicableIntoWorkable<
	C extends WorkableContext,
	T extends Predicable<C>,
>(value: T): PredicableIntoWorkable<C, T> {
	if (typeof value !== "object" || value === null) {
		throw new Error("Invalid Predicable value: must be an object");
	}

	if (isWorkable(value)) {
		return value as unknown as PredicableIntoWorkable<C, T>;
	}

	const converted = Object.fromEntries(
		Object.entries(value).map(([key, val]) => [
			key,
			predicableIntoWorkable(val as Predicable<C>),
		]),
	) as Record<string, Workable<C>>;

	const fieldTypes = Object.fromEntries(
		Object.entries(converted).map(([key, val]) => [key, val[__type]]),
	) as Record<string, AbstractType>;

	return {
		[__type]: new ObjectType(fieldTypes),
		[__display]: (ctx: DisplayContext) => {
			const innerDisplays = Object.entries(converted).map(
				([key, val]) => `${key}: ${val[__display](ctx)}`,
			);
			return `{ ${innerDisplays.join(", ")} }`;
		},
	} as PredicableIntoWorkable<C, T>;
}
