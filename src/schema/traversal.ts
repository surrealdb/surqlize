import type { RecordId } from "surrealdb";
import type { GraphType, RecordType } from "../types";
import type { Workable, WorkableContext } from "../utils";
import type { Actionable } from "../utils/actionable";
import type { EdgeSchema } from "./edge";

/**
 * The target table of an edge — where `->edge->` lands. Resolved directly from
 * the {@link EdgeSchema} generics registered on the ORM, so a single hop is
 * unambiguous (surqlize edges are strictly `from → via → to`).
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

/** The edge's own schema (an `ObjectType` of its fields), as actionable. */
export type EdgeFieldsOf<
	C extends WorkableContext,
	Edge extends string,
> = Edge extends keyof C["orm"]["tables"]
	? C["orm"]["tables"][Edge]["schema"]
	: never;

/**
 * Options for a traversal step. `where` filters on the edge mid-traversal,
 * compiling to `->(edge WHERE …)->target`; its callback receives the edge's
 * fields (e.g. `created`, `role`).
 */
export type TraverseOpts<C extends WorkableContext, Edge extends string> = {
	where?: (edge: Actionable<C, EdgeFieldsOf<C, Edge>>) => Workable<C>;
};

/**
 * A recursion depth: an exact number of hops (`{n}`), an inclusive `[min, max]`
 * range (`{min..max}`), or `{ min?, max? }` for open-ended ranges (`{min..}`,
 * `{..max}`, `{..}`). Omitting it with `collect`/`shortest` defaults to `{..}`.
 */
export type RecurseDepth =
	| number
	| readonly [number, number]
	| { min?: number; max?: number };

/**
 * Recursive / path-finding options for `.out()` / `.in()`. Triggering any of
 * these compiles to SurrealDB's recursive idiom `record.{depth}(->edge->target)`:
 *
 * - `depth` — how many times to repeat the hop; returns the deepest records.
 * - `collect` — gather every unique node encountered (`{depth+collect}`).
 * - `shortest` — the shortest path to a target record (`{depth+shortest=target}`).
 */
export type RecurseOpts<C extends WorkableContext, Edge extends string> = {
	depth?: RecurseDepth;
	collect?: boolean;
	shortest?: RecordId<ToOf<C, Edge>> | Workable<C, RecordType<ToOf<C, Edge>>>;
};

/**
 * Row-level traversal sugar: the traversal verbs callable directly on a select
 * row (`user.out("authored")`), rooted at the row's `id`. On edge tables the
 * runtime keeps `in` / `out` resolving as record-link fields (a verb is only
 * dispatched when the table has no field of that name).
 */
export type RowTraversal<C extends WorkableContext, T extends string> = {
	out<Edge extends OutgoingEdges<C, T>>(
		edge: Edge,
		opts?: TraverseOpts<C, Edge> & RecurseOpts<C, Edge>,
	): Actionable<C, GraphType<ToOf<C, Edge>>>;
	in<Edge extends IncomingEdges<C, T>>(
		edge: Edge,
		opts?: TraverseOpts<C, Edge> & RecurseOpts<C, Edge>,
	): Actionable<C, GraphType<FromOf<C, Edge>>>;
	outEdge<Edge extends OutgoingEdges<C, T>>(
		edge: Edge,
		opts?: TraverseOpts<C, Edge>,
	): Actionable<C, GraphType<Edge>>;
	inEdge<Edge extends IncomingEdges<C, T>>(
		edge: Edge,
		opts?: TraverseOpts<C, Edge>,
	): Actionable<C, GraphType<Edge>>;
};

/** The source table of an edge — where `<-edge<-` lands. */
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

/**
 * The edge names reachable in the outgoing (`->`) direction from a node:
 * every registered edge whose `from` table is `Tb`. Resolved by scanning the
 * edge schemas directly (rather than the one-hop adjacency map, which collapses
 * `via` names across edges once a schema has more than one), so a `.out()` only
 * accepts edges that actually originate at `Tb`. A node with no outgoing edges
 * resolves to `never`, making `.out()` uncallable at compile time.
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
 * The edge names reachable in the incoming (`<-`) direction into a node: every
 * registered edge whose `to` table is `Tb`.
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
