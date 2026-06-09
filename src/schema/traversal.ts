import type { GraphType } from "../types";
import type { Workable, WorkableContext } from "../utils";
import type { Actionable } from "../utils/actionable";
import type { EdgeSchema } from "./edge";
import type { AnyTable } from "./orm";

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
	// biome-ignore lint/suspicious/noExplicitAny: the runtime constructor is context-free; the injected g() supplies a typed context
	C extends WorkableContext = any,
> = {
	readonly [GRAPH_SEGMENT]: true;
	readonly target: Target;
	readonly filter?: GraphFilter<C, Target>;
	where<NextC extends WorkableContext = C>(
		cb: GraphFilter<NextC, Target>,
	): GraphSegmentSpec<Target, NextC>;
};

export function createGraphSegment<
	Target extends string,
	C extends WorkableContext,
>(
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

/**
 * The context-bound segment factory injected into a traversal-step filter
 * callback (`.out((g) => g("edge").where(...))`). Its target is constrained
 * directly to the step's reachable edges — the same direct-constraint pattern
 * `GraphArgs` relies on, so `g("…")` autocompletes — and the spec it returns is
 * bound to the live traversal context `C`, so the segment's `.where((e) => …)`
 * is schema-typed against the edge.
 */
export type SegmentBuilder<
	C extends WorkableContext,
	Tb extends string,
	Dir extends GraphDirection,
> = <Target extends Extract<StepSegments<C, Tb, Dir>, string>>(
	target: Target,
) => GraphSegmentSpec<Target, C>;

/**
 * A traversal-step filter alternative: it receives the context-bound segment
 * factory `g` and returns one (optionally `.where()`-filtered) segment. It is a
 * variadic argument alongside plain edge names, so one step can mix filtered and
 * unfiltered alternatives: `out("a", (g) => g("b").where(...))` → `->(a, b WHERE …)`.
 */
export type SegmentCallback<
	C extends WorkableContext,
	Tb extends string,
	Dir extends GraphDirection,
> = (
	g: SegmentBuilder<C, Tb, Dir>,
) => GraphSegmentSpec<Extract<StepSegments<C, Tb, Dir>, string>, C>;

export function isGraphSegmentSpec(
	value: unknown,
): value is GraphSegmentSpec<string> {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as GraphSegmentSpec)[GRAPH_SEGMENT] === true
	);
}

// biome-ignore lint/suspicious/noExplicitAny: AnyGraphSegmentSpec erases the segment's context type
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

/**
 * The landing target contributed by one traversal argument: a plain edge name or
 * `ANY` contributes itself; a segment callback contributes the target of the
 * segment it builds.
 */
type SegmentArgTarget<Arg> = Arg extends GraphSegmentPrimitive
	? Arg
	: // biome-ignore lint/suspicious/noExplicitAny: pull the built segment's target out of any callback
		Arg extends (g: any) => GraphSegmentSpec<infer Target, any>
		? Target
		: never;

type ValidGraphArg<
	C extends WorkableContext,
	Tb extends string,
	Dir extends GraphDirection,
> = StepSegments<C, Tb, Dir> | SegmentCallback<C, Tb, Dir>;

export type GraphSegmentResult<
	C extends WorkableContext,
	Tb extends string,
	Dir extends GraphDirection,
	Args extends GraphArgs<C, Tb, Dir>,
> = Args extends readonly []
	? StepResultForTarget<C, Tb, Dir, ANY>
	: StepResultForTarget<C, Tb, Dir, SegmentArgTarget<Args[number]>>;

/**
 * The valid arguments for a traversal step from `Tb` in direction `Dir`: each is
 * a reachable edge/table name, the `?` wildcard `ANY`, or a segment callback
 * (`(g) => g("edge").where(...)`) for a filtered alternative. The forms mix
 * freely within one step: `out("a", (g) => g("b").where(...))` → `->(a, b WHERE …)`.
 * Used as the constraint on a traversal method's `const Args` type parameter —
 * constraining the parameter directly (rather than validating via an
 * intersection on the parameter type) is what lets the editor suggest the
 * reachable names, while `Args` still captures the literal tuple that
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
