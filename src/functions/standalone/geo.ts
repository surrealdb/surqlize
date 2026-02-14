import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const geo = {
	area<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "geo::area", value);
	},
	bearing<C extends WorkableContext>(
		source: ContextSource<C>,
		p1: Workable<C>,
		p2: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "geo::bearing", p1, p2);
	},
	centroid<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "geo::centroid", value);
	},
	distance<C extends WorkableContext>(
		source: ContextSource<C>,
		p1: Workable<C>,
		p2: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "geo::distance", p1, p2);
	},
	hashDecode<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "geo::hash::decode", value);
	},
	hashEncode<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "geo::hash::encode", value);
	},
	hashEncodeAccuracy<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
		accuracy: Workable<C>,
	) {
		return standaloneFn(
			source,
			t.string(),
			"geo::hash::encode",
			value,
			accuracy,
		);
	},
};
