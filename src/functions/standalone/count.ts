import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const count = {
	/** count() - counts a row, or counts truthy values if a value is given */
	count<C extends WorkableContext>(
		source: ContextSource<C>,
		value?: Workable<C>,
	) {
		return value
			? standaloneFn(source, t.number(), "count", value)
			: standaloneFn(source, t.number(), "count");
	},
};
