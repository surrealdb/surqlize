import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { standaloneFn } from "./index";

export const set_ = {
	difference<C extends WorkableContext>(a: Workable<C>, b: Workable<C>) {
		return standaloneFn(a, t.string(), "set::difference", a, b);
	},
	intersect<C extends WorkableContext>(a: Workable<C>, b: Workable<C>) {
		return standaloneFn(a, t.string(), "set::intersect", a, b);
	},
	len<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.number(), "set::len", value);
	},
	union<C extends WorkableContext>(a: Workable<C>, b: Workable<C>) {
		return standaloneFn(a, t.string(), "set::union", a, b);
	},
};
