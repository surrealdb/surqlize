import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const rand = {
	rand<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.number(), "rand");
	},
	bool<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.bool(), "rand::bool");
	},
	randEnum<C extends WorkableContext>(
		source: ContextSource<C>,
		...values: Workable<C>[]
	) {
		return standaloneFn(source, t.string(), "rand::enum", ...values);
	},
	float<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.number(), "rand::float");
	},
	floatRange<C extends WorkableContext>(
		source: ContextSource<C>,
		min: Workable<C>,
		max: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "rand::float", min, max);
	},
	guid<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.string(), "rand::guid");
	},
	int<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.number(), "rand::int");
	},
	intRange<C extends WorkableContext>(
		source: ContextSource<C>,
		min: Workable<C>,
		max: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "rand::int", min, max);
	},
	string<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.string(), "rand::string");
	},
	time<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.date(), "rand::time");
	},
	uuid<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.string(), "rand::uuid");
	},
	ulid<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.string(), "rand::ulid");
	},
};
