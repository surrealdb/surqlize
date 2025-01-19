import {
	type AbstractType,
	type ArrayType,
	ObjectType,
	StringType,
} from "../types";
import type { DisplayUtils } from "./display";
import { type Workable, __display, __type } from "./workable";

export type PredicableObject = { [key: string]: Predicable };

export type Predicable = Workable | PredicableObject;

export type PredicableIntoType<T extends Predicable> = T extends Workable<
	infer U
>
	? U
	: T extends PredicableObject
		? ObjectType<{ [K in keyof T]: PredicableIntoType<T[K]> }>
		: never;

export type PredicableIntoWorkable<T extends Predicable> = T extends Workable<
	infer U
>
	? Workable<U>
	: T extends PredicableObject
		? {
				[K in keyof T]: T[K] extends Predicable
					? PredicableIntoWorkable<T[K]>
					: never;
			}
		: never;

export function predicableIntoWorkable<T extends Predicable>(
	value: T,
): PredicableIntoWorkable<T> {
	if (typeof value !== "object" || value === null) {
		throw new Error("Invalid Predicable value: must be an object");
	}

	if ((value as Workable)[__type] !== undefined) {
		return value as unknown as PredicableIntoWorkable<T>;
	}

	const converted = Object.fromEntries(
		Object.entries(value).map(([key, val]) => [
			key,
			predicableIntoWorkable(val as Predicable),
		]),
	) as Record<string, Workable>;

	const fieldTypes = Object.fromEntries(
		Object.entries(converted).map(([key, val]) => [key, val[__type]]),
	) as Record<string, AbstractType>;

	return {
		[__type]: new ObjectType(fieldTypes),
		[__display]: (utils: DisplayUtils) => {
			const innerDisplays = Object.entries(converted).map(
				([key, val]) => `${key}: ${val[__display](utils)}`,
			);
			return `{ ${innerDisplays.join(", ")} }`;
		},
	} as PredicableIntoWorkable<T>;
}
