import type { AbstractType, ArrayType, BoolType } from "../../types";
import {
	type IntoWorkable,
	type Workable,
	type WorkableContext,
	__ctx,
} from "../../utils";
import type { Actionable } from "../../utils/actionable";
import { comparingFilter, joiningFilter, prefixedFilter } from "../filters";

export const functions = {
	// Basic Comparison
	eq<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	) {
		return comparingFilter(this[__ctx], "=", this, v);
	},

	ne<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	) {
		return comparingFilter(this[__ctx], "!=", this, v);
	},

	ex<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	) {
		return comparingFilter(this[__ctx], "==", this, v);
	},

	// Fuzzy Matching
	fy<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	) {
		return comparingFilter(this[__ctx], "~", this, v);
	},

	nf<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	) {
		return comparingFilter(this[__ctx], "!~", this, v);
	},

	// Greater/Less
	gt<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	) {
		return comparingFilter(this[__ctx], ">", this, v);
	},

	gte<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	) {
		return comparingFilter(this[__ctx], ">=", this, v);
	},

	lt<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	) {
		return comparingFilter(this[__ctx], "<", this, v);
	},

	lte<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	) {
		return comparingFilter(this[__ctx], "<=", this, v);
	},

	// Inside
	inside<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, ArrayType<T>>,
	) {
		return comparingFilter(this[__ctx], "IN", this, v);
	},

	notInside<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, ArrayType<T>>,
	) {
		return comparingFilter(this[__ctx], "NOT IN", this, v);
	},

	// Joining
	or<C extends WorkableContext>(this: Workable<C>, ...params: Workable<C>[]) {
		return joiningFilter(this[__ctx], "OR", this, ...params);
	},

	and<C extends WorkableContext>(this: Workable<C>, ...params: Workable<C>[]) {
		return joiningFilter(this[__ctx], "AND", this, ...params);
	},

	// Prefix
	not<C extends WorkableContext>(this: Workable<C>) {
		return prefixedFilter(this[__ctx], "!", this);
	},

	falseish<C extends WorkableContext>(this: Workable<C>) {
		return prefixedFilter(this[__ctx], "!", this);
	},

	trueish<C extends WorkableContext>(this: Workable<C>) {
		return prefixedFilter(this[__ctx], "!!", this);
	},
} satisfies Functions;

export type Functions = {
	// Basic Comparison
	eq<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	): Actionable<C, BoolType>;
	ne<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	): Actionable<C, BoolType>;
	ex<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	): Actionable<C, BoolType>;

	// Fuzzy Matching
	fy<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	): Actionable<C, BoolType>;
	nf<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	): Actionable<C, BoolType>;

	// Greater/Less
	gt<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	): Actionable<C, BoolType>;
	gte<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	): Actionable<C, BoolType>;
	lt<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	): Actionable<C, BoolType>;
	lte<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, T>,
	): Actionable<C, BoolType>;

	// Inside
	inside<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, BoolType>;
	notInside<C extends WorkableContext, T extends AbstractType>(
		this: Workable<C, T>,
		v: IntoWorkable<C, ArrayType<T>>,
	): Actionable<C, BoolType>;

	// Joining
	or<C extends WorkableContext>(
		this: Workable<C>,
		...params: Workable<C>[]
	): Actionable<C, BoolType>;
	and<C extends WorkableContext>(
		this: Workable<C>,
		...params: Workable<C>[]
	): Actionable<C, BoolType>;

	// Prefix
	not<C extends WorkableContext>(this: Workable<C>): Actionable<C, BoolType>;
	falseish<C extends WorkableContext>(
		this: Workable<C>,
	): Actionable<C, BoolType>;
	trueish<C extends WorkableContext>(
		this: Workable<C>,
	): Actionable<C, BoolType>;
};
