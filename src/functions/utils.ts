import {
	ANY,
	createGraphSegment,
	type GraphSegmentArg,
	isGraphSegmentSpec,
} from "../schema/traversal";
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

/** Direction of a graph-traversal segment. */
export type TraversalKind = "out" | "in" | "both";

export type RuntimeGraphAlternative<C extends WorkableContext> = {
	target: string | typeof ANY;
	// biome-ignore lint/suspicious/noExplicitAny: stored graph filters are retyped by the public call signatures
	filter?: (row: any) => Workable<C>;
};

export type RenderedGraphAlternative = {
	target: string | typeof ANY;
	where?: (ctx: DisplayContext) => string;
};

/**
 * Normalise a traversal step's arguments into segment specs. Each argument is a
 * plain edge name / `ANY`, or a filter callback (`(g) => g("edge").where(...)`)
 * which is invoked with the segment constructor — so a step can freely mix the
 * two, e.g. `out("a", (g) => g("b").where(...))`. An empty call is the `?`
 * wildcard.
 */
function resolveSegmentArgs(
	args: readonly unknown[],
): readonly GraphSegmentArg[] {
	if (args.length === 0) return [ANY];
	return args.map((arg) =>
		typeof arg === "function"
			? (arg as (g: typeof createGraphSegment) => GraphSegmentArg)(
					createGraphSegment,
				)
			: (arg as GraphSegmentArg),
	);
}

export function graphAlternatives<C extends WorkableContext>(
	args: readonly unknown[],
): RuntimeGraphAlternative<C>[] {
	return resolveSegmentArgs(args).map((arg) => {
		if (arg === ANY) return { target: ANY };
		if (isGraphSegmentSpec(arg)) {
			return { target: arg.target, filter: arg.filter };
		}
		return { target: arg as string | typeof ANY };
	});
}

export function graphResultTarget(
	alternatives: readonly { target: string | typeof ANY }[],
): string {
	if (
		alternatives.length === 1 &&
		typeof alternatives[0]?.target === "string"
	) {
		return alternatives[0].target;
	}
	return "*";
}

function renderGraphTarget(target: string | typeof ANY): string {
	return target === ANY ? "?" : target;
}

function renderGraphAlternative(
	alternative: RenderedGraphAlternative,
	ctx: DisplayContext,
): string {
	const target = renderGraphTarget(alternative.target);
	if (!alternative.where) return target;
	return `${target} WHERE ${alternative.where(ctx)}`;
}

/**
 * Build one graph-traversal segment. A single method call maps directly to one
 * SurrealQL arrow part: `out("reports_to", "mentors")` renders as
 * `->(reports_to, mentors)`, while `out("authored").out("post")` renders as
 * `->authored->post`.
 */
export function traverse<C extends WorkableContext, Target extends string>(
	parent: Workable<C>,
	kind: TraversalKind,
	alternatives: readonly RenderedGraphAlternative[],
	target: Target,
): Actionable<C, GraphType<Target>> {
	const arrow = kind === "out" ? "->" : kind === "in" ? "<-" : "<->";

	return actionable({
		[__ctx]: parent[__ctx],
		[__type]: new GraphType(target),
		[__display](ctx: DisplayContext) {
			const head = parent[__display](ctx);
			const hasFilter = alternatives.some((alternative) => alternative.where);
			const body = alternatives
				.map((alternative) => renderGraphAlternative(alternative, ctx))
				.join(", ");
			const segment = alternatives.length > 1 || hasFilter ? `(${body})` : body;
			return `${head}${arrow}${segment}`;
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
