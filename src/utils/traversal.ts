import type { AbstractType } from "../types";
import type { Actionable } from "./actionable";
import type { WorkableContext } from "./workable";

/** Traversal verbs that the row sugar exposes by delegating to the row's `id`. */
const TRAVERSAL_VERBS = new Set(["out", "in", "both"]);

/**
 * Wrap a row actionable so graph traversal verbs can be called directly on it:
 * `user.out("authored")` instead of `user.id.out("authored")`.
 *
 * When the table also has a field of that name — an edge's `in` / `out` record
 * link — the verb doubles as that field: still callable for graph traversal
 * (`edge.in("…")`), but property access resolves against the field so nested
 * projections like `edge.in.name.first` keep working.
 */
export function traversableRow<
	C extends WorkableContext,
	T extends AbstractType,
>(row: Actionable<C, T>, fields: Record<string, unknown>): Actionable<C, T> {
	return new Proxy(row, {
		get(target, prop) {
			if (typeof prop === "string" && TRAVERSAL_VERBS.has(prop)) {
				// biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch onto the row's id-record traversal verb
				const idRecord = (target as any).id;
				const verb = (...args: unknown[]) =>
					(idRecord as Record<string, (...a: unknown[]) => unknown>)[prop]!(
						...args,
					);

				// `both` (and `in`/`out` on a non-edge node) is a pure verb. But an
				// edge's `in`/`out` is a real record-link field, so the verb must
				// also forward property reads to the field actionable. Wrapping the
				// verb in a proxy — rather than Object.assign-ing the field's markers
				// onto the function — is what preserves sub-field traversal: a plain
				// function would shadow `.name` with `Function.prototype.name` and
				// collapse deeper access (`edge.in.name.first`) to `undefined`.
				if (prop in fields) {
					const field = target[
						prop as keyof typeof target
					] as unknown as Record<string | symbol, unknown>;
					return new Proxy(verb, {
						get: (_verb, key) => (key === "valueOf" ? () => field : field[key]),
					});
				}

				return verb;
			}
			return target[prop as keyof typeof target];
		},
	}) as Actionable<C, T>;
}
