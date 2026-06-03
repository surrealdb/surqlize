import type { SelectQuery } from "../../query/select";
import type { EdgeSchema } from "../../schema/edge";
import type {
	FromOf,
	IncomingEdges,
	OutgoingEdges,
	RecurseOpts,
	ToOf,
	TraverseOpts,
} from "../../schema/traversal";
import type { GraphType, RecordType } from "../../types";
import { __ctx, type Workable, type WorkableContext } from "../../utils";
import type { Actionable } from "../../utils/actionable";
import { edgeFilter, recursionOf, traverse } from "../utils";

/** Read an edge schema by its registered name. */
function edgeSchema<C extends WorkableContext>(
	workable: Workable<C>,
	edge: string,
): EdgeSchema {
	return (workable[__ctx].orm.tables as Record<string, EdgeSchema>)[edge]!;
}

export const functions = {
	select<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(this: Workable<C, RecordType<Tb>>) {
		return this[__ctx].orm.select(this);
	},

	out<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		Edge extends OutgoingEdges<C, Tb>,
	>(
		this: Workable<C, RecordType<Tb>>,
		edge: Edge,
		opts?: TraverseOpts<C, Edge> & RecurseOpts<C, Edge>,
	) {
		const schema = edgeSchema(this, edge);
		const where = edgeFilter(this[__ctx], schema.schema, opts?.where);
		return traverse(
			this,
			"out",
			edge,
			schema.to,
			where,
			recursionOf(opts),
		) as unknown as Actionable<C, GraphType<ToOf<C, Edge>>>;
	},

	in<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		Edge extends IncomingEdges<C, Tb>,
	>(
		this: Workable<C, RecordType<Tb>>,
		edge: Edge,
		opts?: TraverseOpts<C, Edge> & RecurseOpts<C, Edge>,
	) {
		const schema = edgeSchema(this, edge);
		const where = edgeFilter(this[__ctx], schema.schema, opts?.where);
		return traverse(
			this,
			"in",
			edge,
			schema.from,
			where,
			recursionOf(opts),
		) as unknown as Actionable<C, GraphType<FromOf<C, Edge>>>;
	},

	outEdge<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		Edge extends OutgoingEdges<C, Tb>,
	>(
		this: Workable<C, RecordType<Tb>>,
		edge: Edge,
		opts?: TraverseOpts<C, Edge>,
	) {
		const where = edgeFilter(
			this[__ctx],
			edgeSchema(this, edge).schema,
			opts?.where,
		);
		return traverse(
			this,
			"outEdge",
			edge,
			edge,
			where,
		) as unknown as Actionable<C, GraphType<Edge>>;
	},

	inEdge<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		Edge extends IncomingEdges<C, Tb>,
	>(
		this: Workable<C, RecordType<Tb>>,
		edge: Edge,
		opts?: TraverseOpts<C, Edge>,
	) {
		const where = edgeFilter(
			this[__ctx],
			edgeSchema(this, edge).schema,
			opts?.where,
		);
		return traverse(this, "inEdge", edge, edge, where) as unknown as Actionable<
			C,
			GraphType<Edge>
		>;
	},
} satisfies Functions;

export type Functions = {
	select<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(this: Workable<C, RecordType<Tb>>): SelectQuery<C["orm"], C, Tb>;

	/**
	 * Traverse outgoing through `edge` to the far node: `->edge->target`. Pass
	 * `depth` / `collect` / `shortest` to recurse (`head.{depth}(->edge->target)`).
	 */
	out<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		Edge extends OutgoingEdges<C, Tb>,
	>(
		this: Workable<C, RecordType<Tb>>,
		edge: Edge,
		opts?: TraverseOpts<C, Edge> & RecurseOpts<C, Edge>,
	): Actionable<C, GraphType<ToOf<C, Edge>>>;

	/**
	 * Traverse incoming through `edge` to the far node: `<-edge<-source`. Pass
	 * `depth` / `collect` / `shortest` to recurse.
	 */
	in<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		Edge extends IncomingEdges<C, Tb>,
	>(
		this: Workable<C, RecordType<Tb>>,
		edge: Edge,
		opts?: TraverseOpts<C, Edge> & RecurseOpts<C, Edge>,
	): Actionable<C, GraphType<FromOf<C, Edge>>>;

	/** Traverse outgoing and stop on the edge itself: `->edge`. */
	outEdge<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		Edge extends OutgoingEdges<C, Tb>,
	>(
		this: Workable<C, RecordType<Tb>>,
		edge: Edge,
		opts?: TraverseOpts<C, Edge>,
	): Actionable<C, GraphType<Edge>>;

	/** Traverse incoming and stop on the edge itself: `<-edge`. */
	inEdge<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		Edge extends IncomingEdges<C, Tb>,
	>(
		this: Workable<C, RecordType<Tb>>,
		edge: Edge,
		opts?: TraverseOpts<C, Edge>,
	): Actionable<C, GraphType<Edge>>;
};
