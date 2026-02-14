import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const not_ = {
	not<C extends WorkableContext>(source: ContextSource<C>, value: Workable<C>) {
		return standaloneFn(source, t.bool(), "not", value);
	},
};
