import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const search = {
	analyze<C extends WorkableContext>(
		source: ContextSource<C>,
		analyzer: Workable<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "search::analyze", analyzer, value);
	},
	highlight<C extends WorkableContext>(
		source: ContextSource<C>,
		prefix: Workable<C>,
		suffix: Workable<C>,
		fieldRef: Workable<C>,
	) {
		return standaloneFn(
			source,
			t.string(),
			"search::highlight",
			prefix,
			suffix,
			fieldRef,
		);
	},
	offsets<C extends WorkableContext>(
		source: ContextSource<C>,
		fieldRef: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "search::offsets", fieldRef);
	},
	score<C extends WorkableContext>(
		source: ContextSource<C>,
		fieldRef: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "search::score", fieldRef);
	},
};
