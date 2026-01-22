import type { Orm } from "../schema";
import { type AbstractType, type BoolType, t } from "../types";
import {
	type DisplayContext,
	type IntoWorkable,
	type Workable,
	type WorkableContext,
	__ctx,
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

export function joiningFilter<C extends WorkableContext>(
	ctx: C,
	kind: t.infer<typeof JoiningKind>,
	...params: Workable<C>[]
): Actionable<C, BoolType> {
	return actionable({
		[__ctx]: ctx,
		[__type]: t.bool(),
		[__display](ctx) {
			return params.map((p) => p[__display](ctx)).join(` ${kind} `);
		},
	});
}

export function prefixedFilter<C extends WorkableContext>(
	ctx: C,
	kind: t.infer<typeof PrefixKind>,
	workable: Workable<C>,
): Actionable<C, BoolType> {
	return actionable({
		[__ctx]: ctx,
		[__type]: t.bool(),
		[__display](ctx) {
			return `${kind}${workable[__display](ctx)}`;
		},
	});
}

export function comparingFilter<
	C extends WorkableContext,
	T extends AbstractType,
>(
	ctx: C,
	kind: t.infer<typeof ComparisonKind>,
	l: Workable<C, T>,
	_r: IntoWorkable<C, T>,
): Actionable<C, BoolType> {
	const r = intoWorkable(ctx, l[__type], _r);
	return actionable({
		[__ctx]: ctx,
		[__type]: t.bool(),
		[__display](ctx) {
			return `${l[__display](ctx)} ${kind} ${r[__display](ctx)}`;
		},
	});
}
