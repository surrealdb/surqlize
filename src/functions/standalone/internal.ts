import type { AbstractType } from "../../types";
import {
	__ctx,
	__display,
	__type,
	isWorkable,
	type Workable,
	type WorkableContext,
} from "../../utils";
import { type Actionable, actionable } from "../../utils/actionable";

/**
 * Context source for standalone functions.
 * Accepts either a WorkableContext directly or a Workable to extract context from.
 *
 * This type is part of the public surface because it appears in the signatures
 * of the standalone function families.
 */
export type ContextSource<C extends WorkableContext = WorkableContext> =
	| C
	| Workable<C>;

/**
 * Extract a WorkableContext from either a raw context or a Workable.
 *
 * @internal Implementation detail of the standalone function builders.
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
 *
 * @internal Used to build the standalone function families.
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
 *
 * @internal Used to build the standalone function families.
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
