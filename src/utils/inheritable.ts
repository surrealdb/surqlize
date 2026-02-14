import { OrmError, TypeParseError } from "../error";
import { type AbstractType, ArrayType, ObjectType } from "../types";
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

export type InheritableArray<C extends WorkableContext> =
	readonly Inheritable<C>[];

export type Inheritable<C extends WorkableContext> =
	| Workable<C>
	| InheritableObject<C>
	| InheritableArray<C>;

export type InheritableIntoType<
	C extends WorkableContext,
	T extends Inheritable<C>,
> =
	T extends Workable<C, infer U>
		? U
		: T extends readonly Inheritable<C>[]
			? ArrayType<{
					[K in keyof T]: T[K] extends Inheritable<C>
						? InheritableIntoType<C, T[K]>
						: never;
				}>
			: T extends InheritableObject<C>
				? ObjectType<{ [K in keyof T]: InheritableIntoType<C, T[K]> }>
				: never;

export type InheritableIntoWorkable<
	C extends WorkableContext,
	P extends Inheritable<C>,
> =
	P extends Workable<C, infer T>
		? Workable<C, T>
		: P extends readonly Inheritable<C>[]
			? Workable<C, InheritableIntoType<C, P>>
			: P extends InheritableObject<C>
				? Workable<C, InheritableIntoType<C, P>>
				: never;

export type InheritableForWorkable<
	C extends WorkableContext,
	T extends AbstractType,
	P extends Inheritable<C> = Inheritable<C>,
> = InheritableIntoWorkable<C, P> extends Workable<C, T> ? P : never;

/**
 * Convert an {@link Inheritable} value (a workable, a plain object of
 * workables, or an array of workables) into a single {@link Workable}.
 *
 * @throws {TypeParseError} If `value` is not an object or array.
 * @throws {OrmError} If `value` is an empty object or empty array.
 */
export function inheritableIntoWorkable<
	C extends WorkableContext,
	T extends Inheritable<C>,
>(value: T): InheritableIntoWorkable<C, T> {
	if (typeof value !== "object" || value === null) {
		throw new TypeParseError("inheritable", "object", value);
	}

	if (isWorkable(value)) {
		return value as unknown as InheritableIntoWorkable<C, T>;
	}

	if (Array.isArray(value)) {
		const converted = value.map((item) =>
			inheritableIntoWorkable(item as Inheritable<C>),
		);

		const first = converted[0];
		if (!first) throw new OrmError("Cannot convert empty array to workable");

		return {
			[__ctx]: first[__ctx],
			[__type]: new ArrayType(converted.map((v) => v[__type])),
			[__display]: (ctx: DisplayContext) => {
				return `[${converted.map((v) => v[__display](ctx)).join(", ")}]`;
			},
		} as InheritableIntoWorkable<C, T>;
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
	if (!firstKey) throw new OrmError("Cannot convert empty object to workable");

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
