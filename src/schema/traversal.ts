import type { GraphType } from "../types";
import type { Workable, WorkableContext } from "../utils";
import type { Actionable } from "../utils/actionable";
import type { EdgeSchema } from "./edge";
import type { AnyTable, Orm } from "./orm";

/** A type-safe marker for SurrealQL's graph wildcard segment `?`. */
export const ANY: unique symbol = Symbol("surqlize.graph.ANY");

const GRAPH_SEGMENT: unique symbol = Symbol("surqlize.graph.segment");

export type ANY = typeof ANY;
export type GraphDirection = "out" | "in" | "both";
export type GraphSegmentPrimitive = string | ANY;

export type TableFieldsOf<
	C extends WorkableContext,
	Tb extends string,
> = Tb extends keyof C["orm"]["tables"]
	? C["orm"]["tables"][Tb] extends AnyTable
		? C["orm"]["tables"][Tb]["schema"]
		: never
	: never;

export type GraphFilter<C extends WorkableContext, Target extends string> = (
	row: Actionable<C, TableFieldsOf<C, Target>>,
) => Workable<C>;

export type GraphSegmentSpec<
	Target extends string = string,
	// biome-ignore lint/suspicious/noExplicitAny: standalone g() is context-free; g.with(orm) supplies a typed context
	C extends WorkableContext = any,
> = {
	readonly [GRAPH_SEGMENT]: true;
	readonly target: Target;
	readonly filter?: GraphFilter<C, Target>;
	where<NextC extends WorkableContext = C>(
		cb: GraphFilter<NextC, Target>,
	): GraphSegmentSpec<Target, NextC>;
};

function createGraphSegment<Target extends string, C extends WorkableContext>(
	target: Target,
	filter?: GraphFilter<C, Target>,
): GraphSegmentSpec<Target, C> {
	return {
		[GRAPH_SEGMENT]: true,
		target,
		filter,
		where(cb) {
			return createGraphSegment(target, cb);
		},
	};
}

export interface GraphSegmentFactory {
	/** Build a graph segment alternative, optionally with a segment-local filter. */
	<Target extends string>(target: Target): GraphSegmentSpec<Target>;
	/**
	 * Bind the segment factory to an ORM so `.where()` callbacks can use the
	 * selected table or edge schema.
	 */
	with<O extends Orm>(
		orm: O,
	): <Target extends keyof O["tables"] & string>(
		target: Target,
	) => GraphSegmentSpec<Target, WorkableContext<O>>;
}

export const g: GraphSegmentFactory = Object.assign(
	<Target extends string>(target: Target): GraphSegmentSpec<Target> =>
		createGraphSegment(target),
	{
		with<O extends Orm>(orm: O) {
			void orm;
			return <Target extends keyof O["tables"] & string>(
				target: Target,
			): GraphSegmentSpec<Target, WorkableContext<O>> =>
				createGraphSegment<Target, WorkableContext<O>>(target);
		},
	},
);

export function isGraphSegmentSpec(
	value: unknown,
): value is GraphSegmentSpec<string> {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as GraphSegmentSpec)[GRAPH_SEGMENT] === true
	);
}

// biome-ignore lint/suspicious/noExplicitAny: segment specs can be created standalone or ORM-bound
export type AnyGraphSegmentSpec = GraphSegmentSpec<string, any>;

export type GraphSegmentArg = GraphSegmentPrimitive | AnyGraphSegmentSpec;

/**
 * The target table of an edge, where `->edge->` lands.
 */
export type ToOf<
	C extends WorkableContext,
	Edge extends string,
> = Edge extends keyof C["orm"]["tables"]
	? C["orm"]["tables"][Edge] extends EdgeSchema<
			infer _From,
			infer _Via,
			infer To,
			// biome-ignore lint/suspicious/noExplicitAny: matching the edge's field generic
			any
		>
		? To
		: never
	: never;

/** The source table of an edge, where `<-edge<-` lands. */
export type FromOf<
	C extends WorkableContext,
	Edge extends string,
> = Edge extends keyof C["orm"]["tables"]
	? C["orm"]["tables"][Edge] extends EdgeSchema<
			infer From,
			infer _Via,
			infer _To,
			// biome-ignore lint/suspicious/noExplicitAny: matching the edge's field generic
			any
		>
		? From
		: never
	: never;

type IsEdgeTable<
	C extends WorkableContext,
	Tb extends string,
> = Tb extends keyof C["orm"]["tables"]
	? C["orm"]["tables"][Tb] extends EdgeSchema
		? true
		: false
	: false;

export type OutStepSegments<C extends WorkableContext, Tb extends string> =
	IsEdgeTable<C, Tb> extends true
		? ToOf<C, Tb> | ANY
		: OutgoingEdges<C, Tb> | ANY;

export type InStepSegments<C extends WorkableContext, Tb extends string> =
	IsEdgeTable<C, Tb> extends true
		? FromOf<C, Tb> | ANY
		: IncomingEdges<C, Tb> | ANY;

export type BothStepSegments<C extends WorkableContext, Tb extends string> =
	IsEdgeTable<C, Tb> extends true
		? FromOf<C, Tb> | ToOf<C, Tb> | ANY
		: OutgoingEdges<C, Tb> | IncomingEdges<C, Tb> | ANY;

export type StepSegments<
	C extends WorkableContext,
	Tb extends string,
	Dir extends GraphDirection,
> = Dir extends "out"
	? OutStepSegments<C, Tb>
	: Dir extends "in"
		? InStepSegments<C, Tb>
		: BothStepSegments<C, Tb>;

type AnyOutStep<C extends WorkableContext, Tb extends string> =
	IsEdgeTable<C, Tb> extends true ? ToOf<C, Tb> : OutgoingEdges<C, Tb>;

type AnyInStep<C extends WorkableContext, Tb extends string> =
	IsEdgeTable<C, Tb> extends true ? FromOf<C, Tb> : IncomingEdges<C, Tb>;

type AnyBothStep<C extends WorkableContext, Tb extends string> =
	IsEdgeTable<C, Tb> extends true
		? FromOf<C, Tb> | ToOf<C, Tb>
		: OutgoingEdges<C, Tb> | IncomingEdges<C, Tb>;

type SegmentTarget<Segment extends GraphSegmentArg> =
	// biome-ignore lint/suspicious/noExplicitAny: only the segment target matters for path typing
	Segment extends GraphSegmentSpec<infer Target, any>
		? Target
		: Segment extends GraphSegmentPrimitive
			? Segment
			: never;

type StepResultForTarget<
	C extends WorkableContext,
	Tb extends string,
	Dir extends GraphDirection,
	Target,
> = Target extends ANY
	? Dir extends "out"
		? AnyOutStep<C, Tb>
		: Dir extends "in"
			? AnyInStep<C, Tb>
			: AnyBothStep<C, Tb>
	: Extract<Target, StepSegments<C, Tb, Dir> & string>;

export type StepResult<
	C extends WorkableContext,
	Tb extends string,
	Dir extends GraphDirection,
	Segment extends GraphSegmentArg,
> = StepResultForTarget<C, Tb, Dir, SegmentTarget<Segment>>;

type ValidGraphArg<
	C extends WorkableContext,
	Tb extends string,
	Dir extends GraphDirection,
> =
	| StepSegments<C, Tb, Dir>
	// biome-ignore lint/suspicious/noExplicitAny: filter context is checked by the segment builder
	| GraphSegmentSpec<Extract<StepSegments<C, Tb, Dir>, string>, any>;

export type GraphSegmentResult<
	C extends WorkableContext,
	Tb extends string,
	Dir extends GraphDirection,
	Args extends readonly GraphSegmentArg[],
> = Args extends readonly []
	? StepResult<C, Tb, Dir, ANY>
	: StepResult<C, Tb, Dir, Args[number]>;

/**
 * The valid arguments for a traversal step from `Tb` in direction `Dir`: each
 * is a reachable edge/table name (or the `?` wildcard `ANY`), or a filtered
 * segment spec. Used as the constraint on a traversal method's `const Args`
 * type parameter — constraining the parameter directly (rather than validating
 * via an intersection on the parameter type) is what lets the editor suggest
 * the reachable names, while `Args` still captures the literal tuple that
 * `GraphSegmentResult` needs to type the landing node.
 */
export type GraphArgs<
	C extends WorkableContext,
	Tb extends string,
	Dir extends GraphDirection,
> = readonly ValidGraphArg<C, Tb, Dir>[];

/** Row-level traversal sugar, rooted at the row's `id`. */
export type RowTraversal<C extends WorkableContext, T extends string> = {
	out<const Args extends GraphArgs<C, T, "out">>(
		...args: Args
	): Actionable<C, GraphType<GraphSegmentResult<C, T, "out", Args>>>;
	in<const Args extends GraphArgs<C, T, "in">>(
		...args: Args
	): Actionable<C, GraphType<GraphSegmentResult<C, T, "in", Args>>>;
	both<const Args extends GraphArgs<C, T, "both">>(
		...args: Args
	): Actionable<C, GraphType<GraphSegmentResult<C, T, "both", Args>>>;
};

/**
 * The edge names reachable in the outgoing (`->`) direction from a node.
 */
export type OutgoingEdges<C extends WorkableContext, Tb extends string> = {
	[K in keyof C["orm"]["tables"] &
		string]: C["orm"]["tables"][K] extends EdgeSchema<
		infer From,
		// biome-ignore lint/suspicious/noExplicitAny: matching the edge's via/to/field generics
		any,
		// biome-ignore lint/suspicious/noExplicitAny: matching the edge's via/to/field generics
		any,
		// biome-ignore lint/suspicious/noExplicitAny: matching the edge's via/to/field generics
		any
	>
		? Tb extends From
			? K
			: never
		: never;
}[keyof C["orm"]["tables"] & string];

/**
 * The edge names reachable in the incoming (`<-`) direction into a node.
 */
export type IncomingEdges<C extends WorkableContext, Tb extends string> = {
	[K in keyof C["orm"]["tables"] &
		string]: C["orm"]["tables"][K] extends EdgeSchema<
		// biome-ignore lint/suspicious/noExplicitAny: matching the edge's from/via/field generics
		any,
		// biome-ignore lint/suspicious/noExplicitAny: matching the edge's from/via/field generics
		any,
		infer To,
		// biome-ignore lint/suspicious/noExplicitAny: matching the edge's from/via/field generics
		any
	>
		? Tb extends To
			? K
			: never
		: never;
}[keyof C["orm"]["tables"] & string];
