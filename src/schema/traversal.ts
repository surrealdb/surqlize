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
