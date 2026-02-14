import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const sleep = {
	sleep<C extends WorkableContext>(
		source: ContextSource<C>,
		duration: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "sleep", duration);
	},
};
