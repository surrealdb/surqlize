import type { SurrealSession } from "surrealdb";
import type { DisplayContext } from "../utils/display.ts";
import { displayContext } from "../utils/display.ts";
import { __display } from "../utils/workable.ts";
import type { Query } from "./abstract.ts";

/**
 * Maps a tuple of Query types to a tuple of their inferred result types.
 */
// biome-ignore lint/suspicious/noExplicitAny: required for generic constraint flexibility
export type BatchResult<Q extends Query<any, any>[]> = {
	[K in keyof Q]: Q[K] extends Query<infer _C, infer T> ? T["infer"] : never;
};

/**
 * A batch query that wraps multiple queries in
 * `BEGIN TRANSACTION; ...; COMMIT TRANSACTION;` and executes
 * them as a single atomic operation.
 */
// biome-ignore lint/suspicious/noExplicitAny: required for generic constraint flexibility
export class BatchQuery<Q extends Query<any, any>[]> {
	constructor(
		private readonly surreal: SurrealSession,
		private readonly queries: Q,
	) {}

	[__display](inp: DisplayContext): string {
		const statements = this.queries.map((q) => {
			const sql = q[__display](inp);
			// Strip outer parentheses that queries add for subquery usage
			return sql.startsWith("(") && sql.endsWith(")") ? sql.slice(1, -1) : sql;
		});
		return `BEGIN TRANSACTION; ${statements.join("; ")}; COMMIT TRANSACTION;`;
	}

	toString(): string {
		const ctx = displayContext();
		return this[__display](ctx);
	}

	[Symbol.toStringTag] = "BatchQuery";

	async execute(): Promise<BatchResult<Q>> {
		const ctx = displayContext();
		const query = this[__display](ctx);
		const results = await this.surreal.query<unknown[]>(query, ctx.variables);
		// Skip BEGIN (first) and COMMIT (last) results
		const queryResults = results.slice(1, results.length - 1);
		return queryResults.map((result, i) => {
			return this.queries[i]!.parse(result);
		}) as BatchResult<Q>;
	}

	// biome-ignore lint/suspicious/noThenProperty: intentional for Promise-like behavior
	get then() {
		return <TResult1 = BatchResult<Q>, TResult2 = never>(
			onFulfilled?:
				| ((value: BatchResult<Q>) => TResult1 | PromiseLike<TResult1>)
				| undefined
				| null,
			onRejected?:
				| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
				| undefined
				| null,
		): Promise<TResult1 | TResult2> => {
			return this.execute().then(onFulfilled, onRejected);
		};
	}

	catch<TResult = never>(
		onRejected?:
			| ((reason: unknown) => TResult | PromiseLike<TResult>)
			| null
			| undefined,
	): Promise<BatchResult<Q> | TResult> {
		return this.then(undefined, onRejected);
	}

	finally(
		onFinally?: (() => void) | null | undefined,
	): Promise<BatchResult<Q>> {
		return this.then(
			(value) => {
				onFinally?.();
				return value;
			},
			(reason) => {
				onFinally?.();
				throw reason;
			},
		);
	}
}
