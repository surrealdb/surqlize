import type { SelectQuery } from "../../query/select";
import type {
	GraphArgs,
	GraphDirection,
	GraphSegmentResult,
} from "../../schema/traversal";
import type { GraphType, RecordType } from "../../types";
import { __ctx, type Workable, type WorkableContext } from "../../utils";
import type { Actionable } from "../../utils/actionable";
import {
	edgeFilter,
	graphAlternatives,
	graphResultTarget,
	type RenderedGraphAlternative,
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
};
