import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const meta = {
	id<C extends WorkableContext>(source: ContextSource<C>, value: Workable<C>) {
		return standaloneFn(source, t.string(), "meta::id", value);
	},
	table<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "meta::table", value);
	},
	tb<C extends WorkableContext>(source: ContextSource<C>, value: Workable<C>) {
		return standaloneFn(source, t.string(), "meta::tb", value);
	},
};
