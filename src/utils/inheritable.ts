import { type AbstractType, ObjectType } from "../types";
import type { DisplayContext } from "./display";
import {
	__ctx,
	__display,
	__type,
	isWorkable,
	type Workable,
	type WorkableContext,
} from "./workable";

export type InheritableObject<C extends WorkableContext> = {
	[key: string]: Inheritable<C>;
};

// TODO: Get inheritable arrays to work
export type Inheritable<C extends WorkableContext> =
	| Workable<C>
	| InheritableObject<C>;

export type InheritableIntoType<
	C extends WorkableContext,
	T extends Inheritable<C>,
> =
	T extends Workable<C, infer U>
		? U
		: T extends InheritableObject<C>
			? ObjectType<{ [K in keyof T]: InheritableIntoType<C, T[K]> }>
			: never;

export type InheritableIntoWorkable<
	C extends WorkableContext,
	P extends Inheritable<C>,
> =
	P extends Workable<C, infer T>
		? Workable<C, T>
		: P extends InheritableObject<C>
			? Workable<C, InheritableIntoType<C, P>>
			: never;

export type InheritableForWorkable<
	C extends WorkableContext,
	T extends AbstractType,
	P extends Inheritable<C> = Inheritable<C>,
> = InheritableIntoWorkable<C, P> extends Workable<C, T> ? P : never;

export function inheritableIntoWorkable<
	C extends WorkableContext,
	T extends Inheritable<C>,
>(value: T): InheritableIntoWorkable<C, T> {
	if (typeof value !== "object" || value === null) {
		throw new Error("Invalid Predicable value: must be an object");
	}

	if (isWorkable(value)) {
		return value as unknown as InheritableIntoWorkable<C, T>;
	}

	const converted = Object.fromEntries(
		Object.entries(value).map(([key, val]) => [
			key,
			inheritableIntoWorkable(val as Inheritable<C>),
		]),
	) as Record<string, Workable<C>>;

	const fieldTypes = Object.fromEntries(
		Object.entries(converted).map(([key, val]) => [key, val[__type]]),
	) as Record<string, AbstractType>;

	const firstKey = Object.keys(converted)[0];
	if (!firstKey) throw new Error("Cannot convert empty object to workable");

	return {
		[__ctx]: converted[firstKey]![__ctx],
		[__type]: new ObjectType(fieldTypes),
		[__display]: (ctx: DisplayContext) => {
			const innerDisplays = Object.entries(converted).map(
				([key, val]) => `${key}: ${val[__display](ctx)}`,
			);
			return `{ ${innerDisplays.join(", ")} }`;
		},
	} as InheritableIntoWorkable<C, T>;
}
