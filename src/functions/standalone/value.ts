import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const value = {
	diff<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "value::diff", a, b);
	},
	patch<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
		diff: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "value::patch", value, diff);
	},
};
