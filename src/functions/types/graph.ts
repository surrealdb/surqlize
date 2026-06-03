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
import { type BoolType, type GraphType, type NumberType, t } from "../../types";
import {
	__ctx,
	type IntoWorkable,
	type Workable,
	type WorkableContext,
} from "../../utils";
import type { Actionable } from "../../utils/actionable";
import { comparingFilter } from "../filters";
import { databaseFunction, edgeFilter, recursionOf, traverse } from "../utils";

/**
 * Functions available on a graph-traversal step (a {@link GraphType} workable).
 * Mirrors the record traversal verbs so steps chain indefinitely
 * (`user.out("authored").in("commented")`), plus `.select()` to materialise the
 * landed records into full rows or a projection.
 */

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
	>(this: Workable<C, GraphType<Tb>>) {
		return this[__ctx].orm.select(this);
	},

	out<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		Edge extends OutgoingEdges<C, Tb>,
	>(
		this: Workable<C, GraphType<Tb>>,
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
		this: Workable<C, GraphType<Tb>>,
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
		this: Workable<C, GraphType<Tb>>,
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
		this: Workable<C, GraphType<Tb>>,
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

	// Array predicates over the traversal result, for use in WHERE / projections.
	// `array::len(->edge->target) > 0` is the idiomatic "has any" check.
	len<C extends WorkableContext, Tb extends keyof C["orm"]["tables"] & string>(
		this: Workable<C, GraphType<Tb>>,
	) {
		return databaseFunction(this[__ctx], t.number(), "array::len", this);
	},

	isEmpty<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(this: Workable<C, GraphType<Tb>>) {
		return databaseFunction(this[__ctx], t.bool(), "array::is_empty", this);
	},

	contains<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(this: Workable<C, GraphType<Tb>>, v: IntoWorkable<C>) {
		// Widen `this` so the membership value is an element, not the array itself.
		return comparingFilter(this[__ctx], "CONTAINS", this as Workable<C>, v);
	},
} satisfies Functions;

export type Functions = {
	select<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(this: Workable<C, GraphType<Tb>>): SelectQuery<C["orm"], C, Tb>;

	out<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		Edge extends OutgoingEdges<C, Tb>,
	>(
		this: Workable<C, GraphType<Tb>>,
		edge: Edge,
		opts?: TraverseOpts<C, Edge> & RecurseOpts<C, Edge>,
	): Actionable<C, GraphType<ToOf<C, Edge>>>;

	in<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		Edge extends IncomingEdges<C, Tb>,
	>(
		this: Workable<C, GraphType<Tb>>,
		edge: Edge,
		opts?: TraverseOpts<C, Edge> & RecurseOpts<C, Edge>,
	): Actionable<C, GraphType<FromOf<C, Edge>>>;

	outEdge<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		Edge extends OutgoingEdges<C, Tb>,
	>(
		this: Workable<C, GraphType<Tb>>,
		edge: Edge,
		opts?: TraverseOpts<C, Edge>,
	): Actionable<C, GraphType<Edge>>;

	inEdge<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		Edge extends IncomingEdges<C, Tb>,
	>(
		this: Workable<C, GraphType<Tb>>,
		edge: Edge,
		opts?: TraverseOpts<C, Edge>,
	): Actionable<C, GraphType<Edge>>;

	/** Number of records the traversal lands on (`array::len`). */
	len<C extends WorkableContext, Tb extends keyof C["orm"]["tables"] & string>(
		this: Workable<C, GraphType<Tb>>,
	): Actionable<C, NumberType>;

	/** Whether the traversal lands on no records (`array::is_empty`). */
	isEmpty<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(this: Workable<C, GraphType<Tb>>): Actionable<C, BoolType>;

	/** Whether the traversal result contains a given record (`CONTAINS`). */
	contains<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(
		this: Workable<C, GraphType<Tb>>,
		v: IntoWorkable<C>,
	): Actionable<C, BoolType>;
};
