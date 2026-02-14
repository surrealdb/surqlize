import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { standaloneFn } from "./index";

export const object = {
	entries<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.array(t.string()), "object::entries", value);
	},
	fromEntries<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "object::from_entries", value);
	},
	keys<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.array(t.string()), "object::keys", value);
	},
	len<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.number(), "object::len", value);
	},
	values<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.array(t.string()), "object::values", value);
	},
};
