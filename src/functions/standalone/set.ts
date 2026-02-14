import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const set_ = {
	difference<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "set::difference", a, b);
	},
	intersect<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "set::intersect", a, b);
	},
	len<C extends WorkableContext>(source: ContextSource<C>, value: Workable<C>) {
		return standaloneFn(source, t.number(), "set::len", value);
	},
	union<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "set::union", a, b);
	},
};
