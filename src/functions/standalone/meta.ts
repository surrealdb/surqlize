import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { standaloneFn } from "./index";

export const meta = {
	id<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "meta::id", value);
	},
	table<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "meta::table", value);
	},
	tb<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "meta::tb", value);
	},
};
