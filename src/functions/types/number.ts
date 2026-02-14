import { type NumberType, t } from "../../types";
import {
	type IntoWorkable,
	type Workable,
	type WorkableContext,
	__ctx,
	intoWorkable,
} from "../../utils";
import type { Actionable } from "../../utils/actionable";
import { databaseFunction } from "../utils";

export const functions = {
	// Core
	abs<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::abs", this);
	},
	ceil<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::ceil", this);
	},
	floor<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::floor", this);
	},
	round<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::round", this);
	},
	fixed<C extends WorkableContext>(
		this: Workable<C, NumberType>,
		places: IntoWorkable<C, NumberType>,
	) {
		const val = intoWorkable(this[__ctx], t.number(), places);
		return databaseFunction(this[__ctx], t.number(), "math::fixed", this, val);
	},
	sign<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::sign", this);
	},
	sqrt<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::sqrt", this);
	},
	pow<C extends WorkableContext>(
		this: Workable<C, NumberType>,
		exp: IntoWorkable<C, NumberType>,
	) {
		const val = intoWorkable(this[__ctx], t.number(), exp);
		return databaseFunction(this[__ctx], t.number(), "math::pow", this, val);
	},

	// Trigonometric
	cos<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::cos", this);
	},
	sin<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::sin", this);
	},
	tan<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::tan", this);
	},
	cot<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::cot", this);
	},
	acos<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::acos", this);
	},
	asin<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::asin", this);
	},
	atan<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::atan", this);
	},
	acot<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::acot", this);
	},

	// Logarithmic
	ln<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::ln", this);
	},
	log<C extends WorkableContext>(
		this: Workable<C, NumberType>,
		base: IntoWorkable<C, NumberType>,
	) {
		const val = intoWorkable(this[__ctx], t.number(), base);
		return databaseFunction(this[__ctx], t.number(), "math::log", this, val);
	},
	log10<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::log10", this);
	},
	log2<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::log2", this);
	},

	// Conversion
	deg2rad<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::deg2rad", this);
	},
	rad2deg<C extends WorkableContext>(this: Workable<C, NumberType>) {
		return databaseFunction(this[__ctx], t.number(), "math::rad2deg", this);
	},

	// Interpolation
	lerp<C extends WorkableContext>(
		this: Workable<C, NumberType>,
		to: IntoWorkable<C, NumberType>,
		fraction: IntoWorkable<C, NumberType>,
	) {
		const toVal = intoWorkable(this[__ctx], t.number(), to);
		const fracVal = intoWorkable(this[__ctx], t.number(), fraction);
		return databaseFunction(
			this[__ctx],
			t.number(),
			"math::lerp",
			this,
			toVal,
			fracVal,
		);
	},
	lerpangle<C extends WorkableContext>(
		this: Workable<C, NumberType>,
		to: IntoWorkable<C, NumberType>,
		fraction: IntoWorkable<C, NumberType>,
	) {
		const toVal = intoWorkable(this[__ctx], t.number(), to);
		const fracVal = intoWorkable(this[__ctx], t.number(), fraction);
		return databaseFunction(
			this[__ctx],
			t.number(),
			"math::lerpangle",
			this,
			toVal,
			fracVal,
		);
	},

	// Clamping
	clamp<C extends WorkableContext>(
		this: Workable<C, NumberType>,
		min: IntoWorkable<C, NumberType>,
		max: IntoWorkable<C, NumberType>,
	) {
		const minVal = intoWorkable(this[__ctx], t.number(), min);
		const maxVal = intoWorkable(this[__ctx], t.number(), max);
		return databaseFunction(
			this[__ctx],
			t.number(),
			"math::clamp",
			this,
			minVal,
			maxVal,
		);
	},
} satisfies Functions;

export type Functions = {
	// Core
	abs<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	ceil<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	floor<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	round<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	fixed<C extends WorkableContext>(
		this: Workable<C, NumberType>,
		places: IntoWorkable<C, NumberType>,
	): Actionable<C, NumberType>;
	sign<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	sqrt<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	pow<C extends WorkableContext>(
		this: Workable<C, NumberType>,
		exp: IntoWorkable<C, NumberType>,
	): Actionable<C, NumberType>;

	// Trigonometric
	cos<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	sin<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	tan<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	cot<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	acos<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	asin<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	atan<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	acot<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;

	// Logarithmic
	ln<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	log<C extends WorkableContext>(
		this: Workable<C, NumberType>,
		base: IntoWorkable<C, NumberType>,
	): Actionable<C, NumberType>;
	log10<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	log2<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;

	// Conversion
	deg2rad<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;
	rad2deg<C extends WorkableContext>(
		this: Workable<C, NumberType>,
	): Actionable<C, NumberType>;

	// Interpolation
	lerp<C extends WorkableContext>(
		this: Workable<C, NumberType>,
		to: IntoWorkable<C, NumberType>,
		fraction: IntoWorkable<C, NumberType>,
	): Actionable<C, NumberType>;
	lerpangle<C extends WorkableContext>(
		this: Workable<C, NumberType>,
		to: IntoWorkable<C, NumberType>,
		fraction: IntoWorkable<C, NumberType>,
	): Actionable<C, NumberType>;

	// Clamping
	clamp<C extends WorkableContext>(
		this: Workable<C, NumberType>,
		min: IntoWorkable<C, NumberType>,
		max: IntoWorkable<C, NumberType>,
	): Actionable<C, NumberType>;
};
