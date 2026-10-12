import { type AbstractType, t } from "../../types";
import {
	__ctx,
	intoWorkable,
	isWorkable,
	type Workable,
	type WorkableContext,
} from "../../utils";
import type { Actionable } from "../../utils/actionable";
import { type ContextSource, standaloneFn } from "./internal";

/**
 * A vector operand: a workable expression, or a plain array of numbers, which is
 * bound as a vector literal (the same as `db.value([...])`).
 */
export type VectorArg<C extends WorkableContext = WorkableContext> =
	| Workable<C>
	| number[];

/**
 * Two vector operands, at least one of which is a workable. The workable is what
 * binds the query context, so two plain arrays need `db.value()` instead.
 * `Rest` appends further arguments to the tuple.
 */
type VectorPair<C extends WorkableContext, Rest extends unknown[] = []> =
	| [Workable<C>, VectorArg<C>, ...Rest]
	| [VectorArg<C>, Workable<C>, ...Rest];

/**
 * Build a vector function. The query context comes from the first workable
 * argument. Plain arrays are bound as parameters, with that same context.
 */
function vectorFn<C extends WorkableContext, T extends AbstractType>(
	type: T,
	fn: string,
	...args: VectorArg<C>[]
): Actionable<C, T> {
	const source = args.find((arg): arg is Workable<C> => isWorkable<C>(arg));
	if (!source) {
		throw new TypeError(
			`${fn}() needs at least one workable argument to bind the query context; wrap literal arrays with db.value() when every argument is a literal`,
		);
	}
	const ctx = source[__ctx];
	const params = args.map((arg) =>
		isWorkable<C>(arg) ? arg : intoWorkable(ctx, t.array(t.number()), arg),
	);
	return standaloneFn(source, type, fn, ...params);
}

const vectorType = t.array(t.number());

export const vector = {
	add<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(vectorType, "vector::add", ...args);
	},
	angle<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(t.number(), "vector::angle", ...args);
	},
	cross<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(vectorType, "vector::cross", ...args);
	},
	divide<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(vectorType, "vector::divide", ...args);
	},
	dot<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(t.number(), "vector::dot", ...args);
	},
	magnitude<C extends WorkableContext>(a: Workable<C>) {
		return standaloneFn(a, t.number(), "vector::magnitude", a);
	},
	multiply<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(vectorType, "vector::multiply", ...args);
	},
	normalize<C extends WorkableContext>(a: Workable<C>) {
		return standaloneFn(a, vectorType, "vector::normalize", a);
	},
	project<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(vectorType, "vector::project", ...args);
	},
	subtract<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(vectorType, "vector::subtract", ...args);
	},

	// Distance functions

	/**
	 * The distance the KNN operator computed for the row in the same query
	 * (`vector::distance::knn()`). Valid only in a query with a `knn()` predicate.
	 */
	distanceKnn<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.number(), "vector::distance::knn");
	},

	distanceChebyshev<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(t.number(), "vector::distance::chebyshev", ...args);
	},
	distanceEuclidean<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(t.number(), "vector::distance::euclidean", ...args);
	},
	distanceHamming<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(t.number(), "vector::distance::hamming", ...args);
	},
	distanceMahalanobis<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(t.number(), "vector::distance::mahalanobis", ...args);
	},
	distanceManhattan<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(t.number(), "vector::distance::manhattan", ...args);
	},
	distanceMinkowski<C extends WorkableContext>(
		a: VectorArg<C>,
		b: VectorArg<C>,
		p: Workable<C>,
	) {
		return vectorFn(t.number(), "vector::distance::minkowski", a, b, p);
	},

	// Similarity functions

	similarityCosine<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(t.number(), "vector::similarity::cosine", ...args);
	},
	similarityJaccard<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(t.number(), "vector::similarity::jaccard", ...args);
	},
	similarityPearson<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(t.number(), "vector::similarity::pearson", ...args);
	},
	similaritySpearman<C extends WorkableContext>(...args: VectorPair<C>) {
		return vectorFn(t.number(), "vector::similarity::spearman", ...args);
	},
};
