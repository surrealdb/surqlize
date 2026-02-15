import type { ContextSource } from "../functions/standalone";
import { standaloneFn } from "../functions/standalone";
import type { AbstractType } from "../types";
import type { Workable, WorkableContext } from "../utils";
import type { Actionable } from "../utils/actionable";

/**
 * Infers the TypeScript types from a tuple of `AbstractType` parameters.
 *
 * @example
 * ```ts
 * type P = InferParams<[StringType, NumberType]>;
 * // => [string, number]
 * ```
 */
export type InferParams<P extends AbstractType[]> = {
	[K in keyof P]: P[K]["infer"];
};

/**
 * Maps a tuple of `AbstractType` parameters to a tuple of `Workable` values,
 * used when calling a function within a query context.
 */
type WorkableParams<C extends WorkableContext, P extends AbstractType[]> = {
	[K in keyof P]: Workable<C, P[K]>;
};

/**
 * The shape of a callable user-defined function returned by {@link fn}.
 * Can be called in two ways:
 *
 * 1. **In queries** – pass a `ContextSource` and `Workable` arguments to produce
 *    an `Actionable` that renders as `fn::name(arg1, arg2)` in SurrealQL.
 * 2. **Standalone via `db.run()`** – pass the callable to `db.run()` with raw
 *    values to execute the function on the server.
 *
 * The `.schema` property provides access to the underlying {@link FunctionSchema}.
 */
export type FunctionCallable<
	P extends AbstractType[] = AbstractType[],
	R extends AbstractType = AbstractType,
> = (<C extends WorkableContext>(
	source: ContextSource<C>,
	...args: WorkableParams<C, P>
) => Actionable<C, R>) & {
	schema: FunctionSchema<P, R>;
};

/**
 * Schema definition for a user-defined SurrealDB function (`DEFINE FUNCTION`).
 * Stores the function name, parameter types, and return type.
 *
 * Use the {@link fn} factory function to create callable instances rather than
 * constructing this class directly.
 *
 * @typeParam P - Tuple of parameter types.
 * @typeParam R - The return type.
 */
export class FunctionSchema<
	P extends AbstractType[] = AbstractType[],
	R extends AbstractType = AbstractType,
> {
	constructor(
		public readonly name: string,
		public readonly params: P,
		public readonly returns: R,
	) {}
}

/**
 * Define a user-defined SurrealDB function schema. Returns a callable that can
 * be used both inside queries (producing `fn::name(...)` in SurrealQL) and
 * passed to `db.run()` for standalone execution.
 *
 * @param name - The function name (without the `fn::` prefix).
 * @param params - A tuple of parameter types.
 * @param returns - The return type.
 * @returns A {@link FunctionCallable} with an attached `.schema` property.
 *
 * @example
 * ```ts
 * const greet = fn("greet", [t.string()], t.string());
 *
 * // In a query
 * db.select("user").return(u => ({ greeting: greet(u, u.name) }));
 *
 * // Standalone
 * const result = await db.run(greet, ["world"]);
 * ```
 */
export function fn<P extends AbstractType[], R extends AbstractType>(
	name: string,
	params: P,
	returns: R,
): FunctionCallable<P, R> {
	const schema = new FunctionSchema(name, params, returns);

	const callable = <C extends WorkableContext>(
		source: ContextSource<C>,
		...args: WorkableParams<C, P>
	): Actionable<C, R> => {
		return standaloneFn(
			source,
			returns,
			`fn::${name}`,
			...(args as Workable<C>[]),
		);
	};

	callable.schema = schema;

	return callable as FunctionCallable<P, R>;
}
