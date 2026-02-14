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

/** A single inheritable value: a workable field reference or a plain object. */
export type InheritableElement<C extends WorkableContext> =
	| Workable<C>
	| InheritableObject<C>;

export type InheritableObject<C extends WorkableContext> = {
	[key: string]: Inheritable<C>;
};

/**
 * A composable return value for query projections. Can be a single field
 * reference, a plain object of inheritable values, or an array of elements.
 *
 * Arrays contain {@link InheritableElement} (not full `Inheritable`) to avoid
 * an infinite type cycle — nested arrays are handled at runtime but not at the
 * type level. Objects inside arrays, and arrays inside objects, are both
 * supported.
 */
export type Inheritable<C extends WorkableContext> =
	| InheritableElement<C>
	| readonly InheritableElement<C>[];

export type InheritableIntoType<
	C extends WorkableContext,
	T extends Inheritable<C>,
> =
	T extends Workable<C, infer U>
		? U
		: T extends readonly (infer E extends Inheritable<C>)[]
			? ArrayType<InheritableIntoType<C, E>>
			: T extends InheritableObject<C>
				? ObjectType<{ [K in keyof T]: InheritableIntoType<C, T[K]> }>
				: never;

export type InheritableIntoWorkable<
	C extends WorkableContext,
	P extends Inheritable<C>,
> =
	P extends Workable<C, infer T>
		? Workable<C, T>
		: P extends readonly any[]
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
		} as unknown as InheritableIntoWorkable<C, T>;
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
