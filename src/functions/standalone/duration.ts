import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneConst, standaloneFn } from "./index";

export const duration = {
	// Extraction functions

	days<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "duration::days", value);
	},
	hours<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "duration::hours", value);
	},
	micros<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "duration::micros", value);
	},
	millis<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "duration::millis", value);
	},
	mins<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "duration::mins", value);
	},
	nanos<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "duration::nanos", value);
	},
	secs<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "duration::secs", value);
	},
	weeks<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "duration::weeks", value);
	},
	years<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "duration::years", value);
	},

	// Factory functions

	fromDays<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "duration::from_days", value);
	},
	fromHours<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "duration::from_hours", value);
	},
	fromMicros<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "duration::from_micros", value);
	},
	fromMillis<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "duration::from_millis", value);
	},
	fromMins<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "duration::from_mins", value);
	},
	fromNanos<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "duration::from_nanos", value);
	},
	fromSecs<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "duration::from_secs", value);
	},
	fromWeeks<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "duration::from_weeks", value);
	},

	// Constant

	max<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.string(), "duration::max");
	},
};
