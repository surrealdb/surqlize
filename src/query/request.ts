import {
	type RetryValue,
	SurrealRequestScope,
	SurrealSession,
} from "surrealdb";
import { DuplicateSurrealError } from "../error";

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

/**
 * What the server says when a subject was encoded as an empty object, which is
 * what the SDK does with a `Table` it does not recognise.
 */
const EMPTY_SUBJECT = /Cannot execute \w+ statement using value:\s*\{\s*\}/;

/**
 * Whether `connection` is not made from the `surrealdb` package Surqlize
 * imports, which means two copies are installed.
 */
function isForeignConnection(connection: unknown): boolean {
	return !(
		connection instanceof SurrealSession ||
		connection instanceof SurrealRequestScope
	);
}

/**
 * Turn the failure a duplicated `surrealdb` install causes into a
 * {@link DuplicateSurrealError} that names the cause. Any other error comes
 * back as it was. The server's message alone is not enough to blame
 * duplication, so it is paired with the connection not being ours.
 */
export function diagnoseSdkError(
	connection: SurrealConnection,
	error: unknown,
): unknown {
	if (
		error instanceof Error &&
		EMPTY_SUBJECT.test(error.message) &&
		isForeignConnection(connection)
	) {
		return new DuplicateSurrealError({ cause: error });
	}
	return error;
}

/** Await `run`, translating a duplicate-install failure with {@link diagnoseSdkError}. */
export async function withSdkDiagnosis<T>(
	connection: SurrealConnection,
	run: () => PromiseLike<T>,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		throw diagnoseSdkError(connection, error);
	}
}
