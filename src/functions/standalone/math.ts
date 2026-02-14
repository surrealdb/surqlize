import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneConst, standaloneFn } from "./index";

export const math = {
	// Aggregation functions (single array param)

	max<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::max", arr);
	},
	min<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::min", arr);
	},
	mean<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::mean", arr);
	},
	median<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::median", arr);
	},
	sum<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::sum", arr);
	},
	product<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::product", arr);
	},
	stddev<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::stddev", arr);
	},
	variance<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::variance", arr);
	},
	mode<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::mode", arr);
	},
	spread<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::spread", arr);
	},
	interquartile<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::interquartile", arr);
	},
	midhinge<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::midhinge", arr);
	},
	trimean<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::trimean", arr);
	},

	// Aggregation functions with extra param

	bottom<C extends WorkableContext>(arr: Workable<C>, count: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::bottom", arr, count);
	},
	top<C extends WorkableContext>(arr: Workable<C>, count: Workable<C>) {
		return standaloneFn(arr, t.number(), "math::top", arr, count);
	},
	nearestrank<C extends WorkableContext>(
		arr: Workable<C>,
		percentile: Workable<C>,
	) {
		return standaloneFn(arr, t.number(), "math::nearestrank", arr, percentile);
	},
	percentile<C extends WorkableContext>(
		arr: Workable<C>,
		percentile: Workable<C>,
	) {
		return standaloneFn(arr, t.number(), "math::percentile", arr, percentile);
	},

	// Constants

	e<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::e");
	},
	pi<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::pi");
	},
	tau<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::tau");
	},
	inf<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::inf");
	},
	negInf<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::neg_inf");
	},
	frac1Pi<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::frac_1_pi");
	},
	frac1Sqrt2<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::frac_1_sqrt_2");
	},
	frac2Pi<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::frac_2_pi");
	},
	frac2SqrtPi<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::frac_2_sqrt_pi");
	},
	fracPi2<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::frac_pi_2");
	},
	fracPi3<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::frac_pi_3");
	},
	fracPi4<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::frac_pi_4");
	},
	fracPi6<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::frac_pi_6");
	},
	fracPi8<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::frac_pi_8");
	},
	ln10<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::ln_10");
	},
	ln2<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::ln_2");
	},
	log102<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::log10_2");
	},
	log10E<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::log10_e");
	},
	log210<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::log2_10");
	},
	log2E<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::log2_e");
	},
	sqrt2<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.number(), "math::sqrt_2");
	},
};
