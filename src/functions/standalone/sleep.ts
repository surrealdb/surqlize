import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { standaloneFn } from "./index";

/** sleep(duration) - pauses execution */
export function sleep<C extends WorkableContext>(duration: Workable<C>) {
	return standaloneFn(duration, t.string(), "sleep", duration);
}
