import type { BoolType } from "../../types";
import { __ctx, type Workable, type WorkableContext } from "../../utils";
import type { Actionable } from "../../utils/actionable";
import { joiningFilter } from "../filters";

/** or(...conditions) - combine multiple conditions with OR */
export function or<C extends WorkableContext>(
	...conditions: [Workable<C>, Workable<C>, ...Workable<C>[]]
): Actionable<C, BoolType> {
	return joiningFilter(conditions[0][__ctx], "OR", ...conditions);
}
