import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { standaloneFn } from "./internal";

export const bytes = {
	len<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.number(), "bytes::len", value);
	},
};
