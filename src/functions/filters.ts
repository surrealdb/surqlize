import { type AbstractType, type BoolType, t } from "../types";
import {
	type DisplayUtils,
	type IntoWorkable,
	type Workable,
	__display,
	__type,
	intoWorkable,
} from "../utils";
import { type Actionable, actionable } from "../utils/actionable";

export const JoiningKind = t.union([t.literal("OR"), t.literal("AND")]);
export const PrefixKind = t.union([t.literal("!"), t.literal("!!")]);
export const ComparisonKind = t.union([
	t.literal("??"),
	t.literal("?:"),
	t.literal("="),
	t.literal("!="),
	t.literal("=="),
	t.literal("?="),
	t.literal("*="),
	t.literal("~"),
	t.literal("!~"),
	t.literal("?~"),
	t.literal("*~"),
	t.literal("<"),
	t.literal("<="),
	t.literal(">"),
	t.literal(">="),
	t.literal("IN"),
	t.literal("NOT IN"),
	t.literal("CONTAINS"),
	t.literal("CONTAINSNOT"),
	t.literal("CONTAINSALL"),
	t.literal("CONTAINSANY"),
	t.literal("CONTAINSNONE"),
	t.literal("INSIDE"),
	t.literal("NOTINSIDE"),
	t.literal("ALLINSIDE"),
	t.literal("ANYINSIDE"),
	t.literal("NONEINSIDE"),
	t.literal("OUTSIDE"),
	t.literal("INTERSECTS"),
]);

export function joiningFilter(
	kind: t.infer<typeof JoiningKind>,
	...params: Workable[]
): Actionable<BoolType> {
	return actionable({
		[__type]: t.bool(),
		[__display](utils) {
			return params.map((p) => p[__display](utils)).join(` ${kind} `);
		},
	});
}

export function prefixedFilter(
	kind: t.infer<typeof PrefixKind>,
	workable: Workable,
): Actionable<BoolType> {
	return actionable({
		[__type]: t.bool(),
		[__display](utils) {
			return `${kind}${workable[__display](utils)}`;
		},
	});
}

export function comparingFilter<T extends AbstractType>(
	kind: t.infer<typeof ComparisonKind>,
	l: Workable<T>,
	_r: IntoWorkable<T>,
): Actionable<BoolType> {
	const r = intoWorkable(l[__type], _r);
	return actionable({
		[__type]: t.bool(),
		[__display](utils) {
			return `${l[__display](utils)} ${kind} ${r[__display](utils)}`;
		},
	});
}
