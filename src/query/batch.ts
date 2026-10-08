import { BoundQuery, type RetryValue } from "surrealdb";
import type { DisplayContext } from "../utils/display.ts";
import { displayContext } from "../utils/display.ts";
import { __display } from "../utils/workable.ts";
import type { Query } from "./abstract.ts";
import {
	addSignal,
	bindSignals,
	type RequestOptions,
	type SurrealConnection,
} from "./request.ts";

/**
 * Maps a tuple of Query types to a tuple of their inferred result types.
 */
// biome-ignore lint/suspicious/noExplicitAny: required for generic constraint flexibility
export type BatchResult<Q extends Query<any, any>[]> = {
	[K in keyof Q]: Q[K] extends Query<infer _C, infer T> ? T["infer"] : never;
};

/**
 * A batch of queries that is sent to the server in a single request and applied
 * atomically: either every statement takes effect or none does. It is executed
 * with the SDK's stateless `transaction()`, so it also works over HTTP.
 *
 * Because it is a single request, a batch is safe to replay. Use
 * {@link BatchQuery.retry} to re-send it when it fails because of a conflict with
 * a concurrent transaction.
 */
// biome-ignore lint/suspicious/noExplicitAny: required for generic constraint flexibility
export class BatchQuery<Q extends Query<any, any>[]> {
	constructor(
		private readonly surreal: SurrealConnection,
		private readonly queries: Q,
		private readonly options: RequestOptions = {},
	) {}

	/** Render each query as a single statement sharing one variable store. */
	private statements(inp: DisplayContext): string[] {
		return this.queries.map((q) => {
			const sql = q[__display](inp);
			// Strip outer parentheses that queries add for subquery usage
			return sql.startsWith("(") && sql.endsWith(")") ? sql.slice(1, -1) : sql;
		});
	}

	[__display](inp: DisplayContext): string {
		return `BEGIN TRANSACTION; ${this.statements(inp).join("; ")}; COMMIT TRANSACTION;`;
	}

	toString(): string {
		const ctx = displayContext();
		return this[__display](ctx);
	}

	[Symbol.toStringTag] = "BatchQuery";

	/** A copy of this batch with different request options. */
	private withOptions(options: RequestOptions): BatchQuery<Q> {
		return new BatchQuery(this.surreal, this.queries, options);
	}

	/**
	 * Abandon the batch when `signal` aborts. Calling this more than once
	 * combines the signals.
	 *
	 * Aborting means "stop waiting", and nothing more: the batch is a single
	 * request that the server may carry on to run, so **it may or may not have
	 * been committed**.
	 */
	signal(signal: AbortSignal | undefined): BatchQuery<Q> {
		return this.withOptions(addSignal(this.options, signal));
	}

	/**
	 * Give up on the batch with a `TimeoutError` if the server has not answered
	 * within `milliseconds` (per attempt, when retrying), overriding the
	 * connection's `requestTimeout`. Pass `0` to wait without limit. As for
	 * {@link BatchQuery.signal}, the batch may or may not have been committed.
	 */
	requestTimeout(milliseconds: number): BatchQuery<Q> {
		return this.withOptions({ ...this.options, requestTimeout: milliseconds });
	}

	/**
	 * Re-send the whole batch when it fails because of a conflict with a
	 * concurrent transaction. Defaults to the connection's retry behaviour; pass
	 * options to override it, or `false` to turn it off.
	 *
	 * Conflicts are recognised from the structured `TransactionConflict` error
	 * that SurrealDB 3.1.0 and later report. For earlier servers, pass a
	 * `retryable` predicate.
	 */
	retry(options: RetryValue = true): BatchQuery<Q> {
		return this.withOptions({ ...this.options, retry: options });
	}

	async execute(): Promise<BatchResult<Q>> {
		const ctx = displayContext();
		const statements = this.statements(ctx);
		const connection = bindSignals(this.surreal, this.options);
		// The SDK wraps the statements in BEGIN/COMMIT itself and resolves to one
		// result per statement — and each query here is exactly one statement. It
		// resolves an empty list to `[]`, but rejects an empty statement.
		const queries =
			statements.length === 0
				? []
				: [new BoundQuery(statements.join("; "), ctx.variables)];
		const results = await connection.transaction<unknown[]>(queries, {
			retry: this.options.retry,
			requestTimeout: this.options.requestTimeout,
		});
		return results.map((result, i) => {
			return this.queries[i]!.parseResult(result);
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
