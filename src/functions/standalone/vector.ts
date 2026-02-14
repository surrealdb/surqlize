import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const vector = {
	add<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "vector::add", a, b);
	},
	angle<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "vector::angle", a, b);
	},
	cross<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "vector::cross", a, b);
	},
	divide<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "vector::divide", a, b);
	},
	dot<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "vector::dot", a, b);
	},
	magnitude<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "vector::magnitude", a);
	},
	multiply<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "vector::multiply", a, b);
	},
	normalize<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "vector::normalize", a);
	},
	project<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "vector::project", a, b);
	},
	subtract<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "vector::subtract", a, b);
	},

	// Distance functions

	distanceChebyshev<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(
			source,
			t.number(),
			"vector::distance::chebyshev",
			a,
			b,
		);
	},
	distanceEuclidean<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(
			source,
			t.number(),
			"vector::distance::euclidean",
			a,
			b,
		);
	},
	distanceHamming<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "vector::distance::hamming", a, b);
	},
	distanceMahalanobis<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(
			source,
			t.number(),
			"vector::distance::mahalanobis",
			a,
			b,
		);
	},
	distanceManhattan<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(
			source,
			t.number(),
			"vector::distance::manhattan",
			a,
			b,
		);
	},
	distanceMinkowski<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
		p: Workable<C>,
	) {
		return standaloneFn(
			source,
			t.number(),
			"vector::distance::minkowski",
			a,
			b,
			p,
		);
	},

	// Similarity functions

	similarityCosine<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "vector::similarity::cosine", a, b);
	},
	similarityJaccard<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(
			source,
			t.number(),
			"vector::similarity::jaccard",
			a,
			b,
		);
	},
	similarityPearson<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(
			source,
			t.number(),
			"vector::similarity::pearson",
			a,
			b,
		);
	},
	similaritySpearman<C extends WorkableContext>(
		source: ContextSource<C>,
		a: Workable<C>,
		b: Workable<C>,
	) {
		return standaloneFn(
			source,
			t.number(),
			"vector::similarity::spearman",
			a,
			b,
		);
	},
};
