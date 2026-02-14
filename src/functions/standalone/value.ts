import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { standaloneFn } from "./index";

export const value = {
	diff<C extends WorkableContext>(a: Workable<C>, b: Workable<C>) {
		return standaloneFn(a, t.string(), "value::diff", a, b);
	},
	patch<C extends WorkableContext>(value: Workable<C>, diff: Workable<C>) {
		return standaloneFn(value, t.string(), "value::patch", value, diff);
	},
};
