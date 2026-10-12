import { t } from "../../types";
import {
	__ctx,
	__display,
	__type,
	type Workable,
	type WorkableContext,
} from "../../utils";
import { type ContextSource, extractContext, standaloneFn } from "./internal";

/**
 * count() - counts a row, or counts truthy values if a value is given.
 *
 * A row count renders as `count(true)` rather than `count()`: SurrealDB names a
 * bare `count()` used as a `VALUE` `count`, so a single aggregate in a GROUP ALL
 * came back as `{ count: n }` instead of `n`. `count(true)` counts the same rows.
 */
export function count<C extends WorkableContext>(
	source: ContextSource<C>,
	value?: Workable<C>,
) {
	const ctx = extractContext(source);
	const counted: Workable<C> = value ?? {
		[__ctx]: ctx,
		[__type]: t.bool(),
		[__display]: () => "true",
	};
	return standaloneFn(source, t.number(), "count", counted);
}
