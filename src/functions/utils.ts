import { type AbstractType, GraphType, type ObjectType } from "../types";
import {
	__ctx,
	__display,
	__type,
	type DisplayContext,
	type Workable,
	type WorkableContext,
} from "../utils";
import { type Actionable, actionable } from "../utils/actionable";

export function databaseFunction<
	C extends WorkableContext,
	T extends AbstractType,
>(ctx: C, type: T, fn: string, ...params: Workable<C>[]): Actionable<C, T> {
	return actionable({
		[__ctx]: ctx,
		[__type]: type,
		[__display](ctx) {
			const vars = params.map((p) => p[__display](ctx)).join(", ");
			return `${fn}(${vars})`;
		},
	});
}

/** Direction + landing of a single graph-traversal step. */
export type TraversalKind = "out" | "in" | "outEdge" | "inEdge";

/**
 * Build a graph-traversal expression by appending an edge segment to `parent`'s
 * idiom. `out`/`in` traverse through the edge to the far node
 * (`->edge->target` / `<-edge<-target`); `outEdge`/`inEdge` stop on the edge
 * itself (`->edge` / `<-edge`). An optional `whereSql` renders an edge filter as
 * `->(edge WHERE …)->target`.
 *
 * The result is a {@link GraphType} workable carrying the table it lands on, so
 * it chains (`.out()`/`.in()`), materialises (`.select()`), or — used bare —
 * infers as an array of record links.
 */
export function traverse<C extends WorkableContext, Target extends string>(
	parent: Workable<C>,
	kind: TraversalKind,
	edge: string,
	target: Target,
	whereSql?: (ctx: DisplayContext) => string,
): Actionable<C, GraphType<Target>> {
	const arrow = kind === "out" || kind === "outEdge" ? "->" : "<-";
	const landsOnEdge = kind === "outEdge" || kind === "inEdge";

	return actionable({
		[__ctx]: parent[__ctx],
		[__type]: new GraphType(target),
		[__display](ctx: DisplayContext) {
			const head = parent[__display](ctx);
			const edgeFrag = whereSql ? `(${edge} WHERE ${whereSql(ctx)})` : edge;
			const tail = landsOnEdge ? "" : `${arrow}${target}`;
			return `${head}${arrow}${edgeFrag}${tail}`;
		},
	});
}

/**
 * A proxy over an edge's fields that renders each as a bare identifier
 * (`role`, `created`) rather than `$this.role`. Bare names are what SurrealDB
 * expects inside a graph filter, e.g. `->(authored WHERE role = $v)->post`.
 */
function edgeFieldProxy<C extends WorkableContext>(
	ctx: C,
	schema: ObjectType,
): Actionable<C, ObjectType> {
	return new Proxy(
		{},
		{
			get(_target, prop) {
				const [type] = schema.get(prop as string);
				return actionable({
					[__ctx]: ctx,
					[__type]: type,
					[__display]: () => prop as string,
				});
			},
		},
	) as Actionable<C, ObjectType>;
}

/**
 * Compile an optional edge-filter callback into a renderer for the `WHERE`
 * clause inside a graph traversal, or `undefined` when no filter is given. The
 * callback receives the edge's fields as bare identifiers; the returned
 * function renders the predicate against a display context, so parameters bind
 * into the shared variable store.
 */
export function edgeFilter<C extends WorkableContext>(
	ctx: C,
	schema: ObjectType,
	// biome-ignore lint/suspicious/noExplicitAny: the edge-field shape is enforced at each call's type signature
	cb: ((edge: any) => Workable<C>) | undefined,
): ((ctx: DisplayContext) => string) | undefined {
	if (!cb) return undefined;
	const predicate = cb(edgeFieldProxy(ctx, schema));
	return (dctx) => predicate[__display](dctx);
}
