import type { AbstractType } from "../types";
import type { Actionable } from "./actionable";
import {
	__ctx,
	__display,
	__type,
	isWorkable,
	type WorkableContext,
} from "./workable";

/** Traversal verbs that the row sugar exposes by delegating to the row's `id`. */
const TRAVERSAL_VERBS = new Set(["out", "in", "both"]);

/**
 * Wrap a row actionable so graph traversal verbs can be called directly on it:
 * `user.out("authored")` instead of `user.id.out("authored")`.
 *
 * The returned verb is also a workable field value when the table has a field
 * of the same name, matching the callable-field pattern used by `actionable()`.
 */
export function traversableRow<
	C extends WorkableContext,
	T extends AbstractType,
>(row: Actionable<C, T>, _fields: Record<string, unknown>): Actionable<C, T> {
	return new Proxy(row, {
		get(target, prop) {
			if (typeof prop === "string" && TRAVERSAL_VERBS.has(prop)) {
				// biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch onto the row's id-record traversal verb
				const idRecord = (target as any).id;
				const field = target[prop as keyof typeof target] as unknown;
				const verb = (...args: unknown[]) =>
					(idRecord as Record<string, (...a: unknown[]) => unknown>)[prop]!(
						...args,
					);
				if (isWorkable(field)) {
					return Object.assign(verb, {
						valueOf() {
							return field;
						},
						[__ctx]: field[__ctx],
						[__type]: field[__type],
						[__display]: field[__display],
					});
				}
				return verb;
			}
			return target[prop as keyof typeof target];
		},
	}) as Actionable<C, T>;
}
