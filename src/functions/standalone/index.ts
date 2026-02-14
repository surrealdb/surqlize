import type { AbstractType } from "../../types";
import {
	type Workable,
	type WorkableContext,
	__ctx,
	__display,
	__type,
	isWorkable,
} from "../../utils";
import { type Actionable, actionable } from "../../utils/actionable";

/**
 * Context source for standalone functions.
 * Accepts either a WorkableContext directly or a Workable to extract context from.
 */
export type ContextSource<C extends WorkableContext = WorkableContext> =
	| C
	| Workable<C>;

/**
 * Extract a WorkableContext from either a raw context or a Workable.
 */
export function extractContext<C extends WorkableContext>(
	source: ContextSource<C>,
): C {
	if (isWorkable(source)) {
		return source[__ctx];
	}
	return source as C;
}

/**
 * Create a standalone database function that generates SurrealQL like `fn_name(param1, param2)`.
 * Unlike databaseFunction in ../utils.ts, this doesn't require a pre-existing Workable context binding.
 */
export function standaloneFn<C extends WorkableContext, T extends AbstractType>(
	source: ContextSource<C>,
	type: T,
	fn: string,
	...params: Workable<C>[]
): Actionable<C, T> {
	const ctx = extractContext(source);
	return actionable({
		[__ctx]: ctx,
		[__type]: type,
		[__display](ctx) {
			const vars = params.map((p) => p[__display](ctx)).join(", ");
			return vars ? `${fn}(${vars})` : `${fn}()`;
		},
	});
}

/**
 * Create a standalone constant reference (no parentheses).
 * Generates SurrealQL like `math::pi` or `math::e`.
 */
export function standaloneConst<
	C extends WorkableContext,
	T extends AbstractType,
>(source: ContextSource<C>, type: T, name: string): Actionable<C, T> {
	const ctx = extractContext(source);
	return actionable({
		[__ctx]: ctx,
		[__type]: type,
		[__display]() {
			return name;
		},
	});
}

export * from "./count";
export * from "./math";
export * from "./time";
export * from "./crypto";
export * from "./rand";
export * from "./type";
export * from "./duration";
export * from "./encoding";
export * from "./geo";
export * from "./http";
export * from "./meta";
export * from "./object";
export * from "./parse";
export * from "./search";
export * from "./session";
export * from "./set";
export * from "./sleep";
export * from "./value";
export * from "./vector";
export * from "./bytes";
export * from "./not";
