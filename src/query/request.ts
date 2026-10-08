import type {
	RetryValue,
	SurrealRequestScope,
	SurrealSession,
} from "surrealdb";

/**
 * The SDK handle an {@link Orm} sends its queries through: a session (`Surreal`
 * is one), or the view of a session bound to an `AbortSignal` that
 * `withSignal()` returns.
 */
export type SurrealConnection = SurrealSession | SurrealRequestScope;

/**
 * Client-side options that the SDK applies when it sends a query. They concern
 * how long and how hard the client waits for the answer, not what the server
 * executes — unlike the `TIMEOUT` clause that `.timeout()` renders.
 */
export type RequestOptions = {
	readonly signals?: readonly AbortSignal[];
	readonly requestTimeout?: number;
	readonly retry?: RetryValue;
};

/**
 * Add a signal to `options`. Signals combine: the request is abandoned when any
 * of them aborts. A missing signal changes nothing, as in the SDK.
 */
export function addSignal(
	options: RequestOptions,
	signal: AbortSignal | undefined,
): RequestOptions {
	if (!signal) return options;
	return { ...options, signals: [...(options.signals ?? []), signal] };
}

/** The part of the SDK's `Query` that {@link applyRequestOptions} configures. */
type Configurable<Q> = {
	signal(signal: AbortSignal | undefined): Q;
	requestTimeout(milliseconds: number): Q;
	retry(options?: RetryValue): Q;
};

/**
 * Configure an SDK query with `options`. The SDK's `Query` class is not
 * exported, so this is typed on the methods it is configured through.
 */
export function applyRequestOptions<Q extends Configurable<Q>>(
	query: Q,
	options: RequestOptions,
): Q {
	let configured = query;
	for (const signal of options.signals ?? []) {
		configured = configured.signal(signal);
	}
	if (options.requestTimeout !== undefined) {
		configured = configured.requestTimeout(options.requestTimeout);
	}
	if (options.retry !== undefined) {
		configured = configured.retry(options.retry);
	}
	return configured;
}

/**
 * Bind a connection to every signal in `options`, so that whatever is run
 * through the result is abandoned when any of them aborts. Used where the SDK
 * takes a single signal (`transaction()`), which `withSignal()` chains past.
 */
export function bindSignals(
	connection: SurrealConnection,
	options: RequestOptions,
): SurrealConnection {
	let bound = connection;
	for (const signal of options.signals ?? []) {
		bound = bound.withSignal(signal);
	}
	return bound;
}
