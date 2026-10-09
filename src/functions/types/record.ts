import type { SelectQuery } from "../../query/select";
import type {
	GraphArgs,
	GraphDirection,
	GraphSegmentResult,
	RecursionBody,
	RecursionDepth,
	RecursionOptions,
} from "../../schema/traversal";
import type { GraphType, OptionType, RecordType } from "../../types";
import {
	__ctx,
	__display,
	__type,
	type IntoWorkable,
	intoWorkable,
	type Workable,
	type WorkableContext,
} from "../../utils";
import type { Actionable } from "../../utils/actionable";
import {
	edgeFilter,
	graphAlternatives,
	graphResultTarget,
	type RenderedGraphAlternative,
	recursion,
	renderRecursionDepth,
	traverse,
} from "../utils";

function tableSchema<C extends WorkableContext>(
	workable: Workable<C>,
	target: string,
) {
	return workable[__ctx].orm.tables[target]?.schema;
}

function graph<
	C extends WorkableContext,
	Tb extends keyof C["orm"]["tables"] & string,
	Dir extends GraphDirection,
	const Args extends GraphArgs<C, Tb, Dir>,
>(workable: Workable<C, RecordType<Tb>>, direction: Dir, args: Args) {
	const alternatives = graphAlternatives<C>(args);
	const rendered: RenderedGraphAlternative[] = alternatives.map(
		(alternative) => {
			const schema =
				typeof alternative.target === "string"
					? tableSchema(workable, alternative.target)
					: undefined;
			return {
				target: alternative.target,
				where: schema
					? edgeFilter(workable[__ctx], schema, alternative.filter)
					: undefined,
			};
		},
	);
	const target = graphResultTarget(alternatives);

	return traverse(
		workable,
		direction,
		rendered,
		target,
	) as unknown as Actionable<
		C,
		GraphType<GraphSegmentResult<C, Tb, Dir, Args>>
	>;
}

export const functions = {
	select<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(this: Workable<C, RecordType<Tb>>): SelectQuery<C["orm"], C, Tb> {
		return this[__ctx].orm.select(this) as unknown as SelectQuery<
			C["orm"],
			C,
			Tb
		>;
	},

	out<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		const Args extends GraphArgs<C, Tb, "out">,
	>(this: Workable<C, RecordType<Tb>>, ...args: Args) {
		return graph(this, "out", args);
	},

	in<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		const Args extends GraphArgs<C, Tb, "in">,
	>(this: Workable<C, RecordType<Tb>>, ...args: Args) {
		return graph(this, "in", args);
	},

	both<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		const Args extends GraphArgs<C, Tb, "both">,
	>(this: Workable<C, RecordType<Tb>>, ...args: Args) {
		return graph(this, "both", args);
	},

	recurse<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(
		this: Workable<C, RecordType<Tb>>,
		depth: RecursionDepth,
		body: RecursionBody<C, Tb>,
	) {
		return recursion(
			this,
			this[__type].tb as Tb,
			{ depth: renderRecursionDepth(depth) },
			body,
		);
	},

	collect<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(
		this: Workable<C, RecordType<Tb>>,
		...args:
			| [RecursionDepth, RecursionBody<C, Tb>, RecursionOptions?]
			| [RecursionBody<C, Tb>, RecursionOptions?]
	) {
		const [depth, body, options] =
			typeof args[0] === "function"
				? ([{}, args[0], args[1]] as [
						RecursionDepth,
						RecursionBody<C, Tb>,
						RecursionOptions?,
					])
				: (args as [RecursionDepth, RecursionBody<C, Tb>, RecursionOptions?]);
		const inclusive = options?.inclusive ? "+inclusive" : "";
		return recursion(
			this,
			this[__type].tb as Tb,
			{
				depth: renderRecursionDepth(depth),
				modifiers: () => `+collect${inclusive}`,
			},
			body,
		);
	},

	shortest<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(
		this: Workable<C, RecordType<Tb>>,
		target: IntoWorkable<C, RecordType<Tb>>,
		body: RecursionBody<C, Tb>,
		options?: RecursionOptions,
	) {
		const to = intoWorkable(this[__ctx], this[__type], target);
		const inclusive = options?.inclusive ? "+inclusive" : "";
		return recursion<C, Tb, OptionType<GraphType<Tb>>>(
			this,
			this[__type].tb as Tb,
			{
				depth: "..",
				modifiers: (ctx) => `+shortest=${to[__display](ctx)}${inclusive}`,
				optional: true,
			},
			body,
		);
	},
} satisfies Functions;

export type Functions = {
	select<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(this: Workable<C, RecordType<Tb>>): SelectQuery<C["orm"], C, Tb>;

	out<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		const Args extends GraphArgs<C, Tb, "out">,
	>(
		this: Workable<C, RecordType<Tb>>,
		...args: Args
	): Actionable<C, GraphType<GraphSegmentResult<C, Tb, "out", Args>>>;

	in<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		const Args extends GraphArgs<C, Tb, "in">,
	>(
		this: Workable<C, RecordType<Tb>>,
		...args: Args
	): Actionable<C, GraphType<GraphSegmentResult<C, Tb, "in", Args>>>;

	both<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		const Args extends GraphArgs<C, Tb, "both">,
	>(
		this: Workable<C, RecordType<Tb>>,
		...args: Args
	): Actionable<C, GraphType<GraphSegmentResult<C, Tb, "both", Args>>>;

	/** Repeat a step over a depth: `.{depth}(step)`. See `RecursiveTraversal`. */
	recurse<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(
		this: Workable<C, RecordType<Tb>>,
		depth: RecursionDepth,
		body: RecursionBody<C, Tb>,
	): Actionable<C, GraphType<Tb>>;

	/** Unique nodes reached within a depth: `.{depth+collect}(step)`. */
	collect<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(
		this: Workable<C, RecordType<Tb>>,
		depth: RecursionDepth,
		body: RecursionBody<C, Tb>,
		options?: RecursionOptions,
	): Actionable<C, GraphType<Tb>>;
	collect<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(
		this: Workable<C, RecordType<Tb>>,
		body: RecursionBody<C, Tb>,
		options?: RecursionOptions,
	): Actionable<C, GraphType<Tb>>;

	/** Shortest path to a record: `.{..+shortest=target}(step)`, or `NONE`. */
	shortest<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(
		this: Workable<C, RecordType<Tb>>,
		target: IntoWorkable<C, RecordType<Tb>>,
		body: RecursionBody<C, Tb>,
		options?: RecursionOptions,
	): Actionable<C, OptionType<GraphType<Tb>>>;
};
