import type { AbstractType } from "../types";
import type { Actionable } from "./actionable";
import type { WorkableContext } from "./workable";

/** Traversal verbs that the row sugar exposes by delegating to the row's `id`. */
const TRAVERSAL_VERBS = new Set(["out", "in", "outEdge", "inEdge"]);

/**
 * Wrap a row actionable so the traversal verbs (`out`, `in`, `outEdge`,
 * `inEdge`) can be called directly on it — `user.out("authored")` instead of
 * `user.id.out("authored")` — by delegating to the row's `id` record.
 *
 * A verb is only intercepted when the table has no field of that name, so a
 * verb never shadows a real field. This matters for edge tables, whose `in` /
 * `out` record-link fields must keep resolving as field access.
 */
export function traversableRow<
	C extends WorkableContext,
	T extends AbstractType,
>(row: Actionable<C, T>, fields: Record<string, unknown>): Actionable<C, T> {
	return new Proxy(row, {
		get(target, prop) {
			if (
				typeof prop === "string" &&
				TRAVERSAL_VERBS.has(prop) &&
				!(prop in fields)
			) {
				// biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch onto the row's id-record traversal verb
				const idRecord = (target as any).id;
				return (...args: unknown[]) =>
					(idRecord as Record<string, (...a: unknown[]) => unknown>)[prop]!(
						...args,
					);
			}
			return target[prop as keyof typeof target];
		},
	}) as Actionable<C, T>;
}
