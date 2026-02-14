import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const bytes = {
	len<C extends WorkableContext>(source: ContextSource<C>, value: Workable<C>) {
		return standaloneFn(source, t.number(), "bytes::len", value);
	},
};
