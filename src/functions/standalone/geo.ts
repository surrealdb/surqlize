import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { standaloneFn } from "./index";

export const geo = {
	area<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.number(), "geo::area", value);
	},
	bearing<C extends WorkableContext>(p1: Workable<C>, p2: Workable<C>) {
		return standaloneFn(p1, t.number(), "geo::bearing", p1, p2);
	},
	centroid<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "geo::centroid", value);
	},
	distance<C extends WorkableContext>(p1: Workable<C>, p2: Workable<C>) {
		return standaloneFn(p1, t.number(), "geo::distance", p1, p2);
	},
	hashDecode<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "geo::hash::decode", value);
	},
	hashEncode<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "geo::hash::encode", value);
	},
	hashEncodeAccuracy<C extends WorkableContext>(
		value: Workable<C>,
		accuracy: Workable<C>,
	) {
		return standaloneFn(
			value,
			t.string(),
			"geo::hash::encode",
			value,
			accuracy,
		);
	},
};
