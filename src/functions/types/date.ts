import {
	type BoolType,
	type DateType,
	type NumberType,
	type StringType,
	t,
} from "../../types";
import {
	__ctx,
	type IntoWorkable,
	intoWorkable,
	type Workable,
	type WorkableContext,
} from "../../utils";
import type { Actionable } from "../../utils/actionable";
import { databaseFunction } from "../utils";

export const functions = {
	// Extraction
	day<C extends WorkableContext>(this: Workable<C, DateType>) {
		return databaseFunction(this[__ctx], t.number(), "time::day", this);
	},
	hour<C extends WorkableContext>(this: Workable<C, DateType>) {
		return databaseFunction(this[__ctx], t.number(), "time::hour", this);
	},
	minute<C extends WorkableContext>(this: Workable<C, DateType>) {
		return databaseFunction(this[__ctx], t.number(), "time::minute", this);
	},
	second<C extends WorkableContext>(this: Workable<C, DateType>) {
		return databaseFunction(this[__ctx], t.number(), "time::second", this);
	},
	month<C extends WorkableContext>(this: Workable<C, DateType>) {
		return databaseFunction(this[__ctx], t.number(), "time::month", this);
	},
	year<C extends WorkableContext>(this: Workable<C, DateType>) {
		return databaseFunction(this[__ctx], t.number(), "time::year", this);
	},
	week<C extends WorkableContext>(this: Workable<C, DateType>) {
		return databaseFunction(this[__ctx], t.number(), "time::week", this);
	},
	wday<C extends WorkableContext>(this: Workable<C, DateType>) {
		return databaseFunction(this[__ctx], t.number(), "time::wday", this);
	},
	yday<C extends WorkableContext>(this: Workable<C, DateType>) {
		return databaseFunction(this[__ctx], t.number(), "time::yday", this);
	},

	// Conversion
	unix<C extends WorkableContext>(this: Workable<C, DateType>) {
		return databaseFunction(this[__ctx], t.number(), "time::unix", this);
	},
	millis<C extends WorkableContext>(this: Workable<C, DateType>) {
		return databaseFunction(this[__ctx], t.number(), "time::millis", this);
	},
	micros<C extends WorkableContext>(this: Workable<C, DateType>) {
		return databaseFunction(this[__ctx], t.number(), "time::micros", this);
	},
	nano<C extends WorkableContext>(this: Workable<C, DateType>) {
		return databaseFunction(this[__ctx], t.number(), "time::nano", this);
	},

	// Rounding
	timeCeil<C extends WorkableContext>(
		this: Workable<C, DateType>,
		duration: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), duration);
		return databaseFunction(this[__ctx], t.date(), "time::ceil", this, val);
	},
	timeFloor<C extends WorkableContext>(
		this: Workable<C, DateType>,
		duration: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), duration);
		return databaseFunction(this[__ctx], t.date(), "time::floor", this, val);
	},
	timeRound<C extends WorkableContext>(
		this: Workable<C, DateType>,
		duration: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), duration);
		return databaseFunction(this[__ctx], t.date(), "time::round", this, val);
	},

	// Other
	format<C extends WorkableContext>(
		this: Workable<C, DateType>,
		fmt: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), fmt);
		return databaseFunction(this[__ctx], t.string(), "time::format", this, val);
	},
	timeGroup<C extends WorkableContext>(
		this: Workable<C, DateType>,
		interval: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), interval);
		return databaseFunction(this[__ctx], t.date(), "time::group", this, val);
	},
	isLeapYear<C extends WorkableContext>(this: Workable<C, DateType>) {
		return databaseFunction(this[__ctx], t.bool(), "time::is_leap_year", this);
	},
} satisfies Functions;

export type Functions = {
	// Extraction
	day<C extends WorkableContext>(
		this: Workable<C, DateType>,
	): Actionable<C, NumberType>;
	hour<C extends WorkableContext>(
		this: Workable<C, DateType>,
	): Actionable<C, NumberType>;
	minute<C extends WorkableContext>(
		this: Workable<C, DateType>,
	): Actionable<C, NumberType>;
	second<C extends WorkableContext>(
		this: Workable<C, DateType>,
	): Actionable<C, NumberType>;
	month<C extends WorkableContext>(
		this: Workable<C, DateType>,
	): Actionable<C, NumberType>;
	year<C extends WorkableContext>(
		this: Workable<C, DateType>,
	): Actionable<C, NumberType>;
	week<C extends WorkableContext>(
		this: Workable<C, DateType>,
	): Actionable<C, NumberType>;
	wday<C extends WorkableContext>(
		this: Workable<C, DateType>,
	): Actionable<C, NumberType>;
	yday<C extends WorkableContext>(
		this: Workable<C, DateType>,
	): Actionable<C, NumberType>;

	// Conversion
	unix<C extends WorkableContext>(
		this: Workable<C, DateType>,
	): Actionable<C, NumberType>;
	millis<C extends WorkableContext>(
		this: Workable<C, DateType>,
	): Actionable<C, NumberType>;
	micros<C extends WorkableContext>(
		this: Workable<C, DateType>,
	): Actionable<C, NumberType>;
	nano<C extends WorkableContext>(
		this: Workable<C, DateType>,
	): Actionable<C, NumberType>;

	// Rounding
	timeCeil<C extends WorkableContext>(
		this: Workable<C, DateType>,
		duration: IntoWorkable<C, StringType>,
	): Actionable<C, DateType>;
	timeFloor<C extends WorkableContext>(
		this: Workable<C, DateType>,
		duration: IntoWorkable<C, StringType>,
	): Actionable<C, DateType>;
	timeRound<C extends WorkableContext>(
		this: Workable<C, DateType>,
		duration: IntoWorkable<C, StringType>,
	): Actionable<C, DateType>;

	// Other
	format<C extends WorkableContext>(
		this: Workable<C, DateType>,
		fmt: IntoWorkable<C, StringType>,
	): Actionable<C, StringType>;
	timeGroup<C extends WorkableContext>(
		this: Workable<C, DateType>,
		interval: IntoWorkable<C, StringType>,
	): Actionable<C, DateType>;
	isLeapYear<C extends WorkableContext>(
		this: Workable<C, DateType>,
	): Actionable<C, BoolType>;
};
