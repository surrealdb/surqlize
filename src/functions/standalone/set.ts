import type { AbstractType } from "../../types";
import { t } from "../../types";
import { __type, type Workable, type WorkableContext } from "../../utils";
import { standaloneFn } from "./internal";

// Named `set_` (trailing underscore) for consistency with `type_` (which must
// avoid the `export { type }` syntax collision). Maps to the SurrealQL `set`
// function family.
export const set_ = {
	difference<C extends WorkableContext, T extends AbstractType>(
		a: Workable<C, T>,
		b: Workable<C>,
	) {
		return standaloneFn(a, a[__type], "set::difference", a, b);
	},
	intersect<C extends WorkableContext, T extends AbstractType>(
		a: Workable<C, T>,
		b: Workable<C>,
	) {
		return standaloneFn(a, a[__type], "set::intersect", a, b);
	},
	len<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.number(), "set::len", value);
	},
	union<C extends WorkableContext, T extends AbstractType>(
		a: Workable<C, T>,
		b: Workable<C>,
	) {
		return standaloneFn(a, a[__type], "set::union", a, b);
	},
};
