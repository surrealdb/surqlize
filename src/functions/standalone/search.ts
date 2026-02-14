import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { standaloneFn } from "./index";

export const search = {
	analyze<C extends WorkableContext>(
		analyzer: Workable<C>,
		value: Workable<C>,
	) {
		return standaloneFn(
			analyzer,
			t.string(),
			"search::analyze",
			analyzer,
			value,
		);
	},
	highlight<C extends WorkableContext>(
		prefix: Workable<C>,
		suffix: Workable<C>,
		fieldRef: Workable<C>,
	) {
		return standaloneFn(
			prefix,
			t.string(),
			"search::highlight",
			prefix,
			suffix,
			fieldRef,
		);
	},
	offsets<C extends WorkableContext>(fieldRef: Workable<C>) {
		return standaloneFn(fieldRef, t.string(), "search::offsets", fieldRef);
	},
	score<C extends WorkableContext>(fieldRef: Workable<C>) {
		return standaloneFn(fieldRef, t.number(), "search::score", fieldRef);
	},
};
