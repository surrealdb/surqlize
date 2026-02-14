import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { standaloneFn } from "./index";

/** not(value) - logical negation */
export function not<C extends WorkableContext>(value: Workable<C>) {
	return standaloneFn(value, t.bool(), "not", value);
}
