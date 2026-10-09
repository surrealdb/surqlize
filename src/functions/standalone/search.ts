import { type ArrayType, type StringType, t } from "../../types";
import {
	__ctx,
	type IntoWorkable,
	intoWorkable,
	type Workable,
	type WorkableContext,
} from "../../utils";
import { literalWorkable, matchRef } from "../utils";
import { standaloneFn } from "./internal";

/** A `{ s, e }` byte span, as reported by `search::offsets`. */
const span = t.object({ s: t.number(), e: t.number() });

export const search = {
	/** `search::analyze(analyzer, value)`: the tokens `value` is analysed into. */
	analyze<C extends WorkableContext>(
		analyzer: Workable<C>,
		value: Workable<C>,
	) {
		return standaloneFn(
			analyzer,
			t.array(t.string()),
			"search::analyze",
			analyzer,
			value,
		);
	},

	/**
	 * `search::highlight(prefix, suffix, ref)`: the text of the field matched by
	 * the `@ref@` clause, with each matched term wrapped in `prefix`/`suffix`.
	 *
	 * `fieldRef` supplies the query context. The match is identified by `ref`,
	 * which must equal the N of a `.search(value, N)` clause in the same
	 * statement.
	 */
	highlight<C extends WorkableContext>(
		fieldRef: Workable<C>,
		prefix: IntoWorkable<C, StringType>,
		suffix: IntoWorkable<C, StringType>,
		ref: number,
	) {
		const ctx = fieldRef[__ctx];
		return standaloneFn(
			fieldRef,
			t.string(),
			"search::highlight",
			intoWorkable(ctx, t.string(), prefix),
			intoWorkable(ctx, t.string(), suffix),
			literalWorkable(ctx, t.number(), String(matchRef(ref))),
		);
	},

	/**
	 * `search::offsets(ref)`: the matched spans of the `@ref@` clause, keyed by
	 * field. `fieldRef` supplies the query context; see {@link search.highlight}.
	 */
	offsets<C extends WorkableContext>(fieldRef: Workable<C>, ref: number) {
		const ctx = fieldRef[__ctx];
		return standaloneFn(
			fieldRef,
			t.object({} as Record<string, ArrayType<typeof span>>),
			"search::offsets",
			literalWorkable(ctx, t.number(), String(matchRef(ref))),
		);
	},

	/**
	 * `search::score(ref)`: the BM25 relevance of the `@ref@` clause. `fieldRef`
	 * supplies the query context; see {@link search.highlight}.
	 */
	score<C extends WorkableContext>(fieldRef: Workable<C>, ref: number) {
		const ctx = fieldRef[__ctx];
		return standaloneFn(
			fieldRef,
			t.number(),
			"search::score",
			literalWorkable(ctx, t.number(), String(matchRef(ref))),
		);
	},
};
