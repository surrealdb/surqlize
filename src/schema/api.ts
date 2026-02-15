import type { AbstractType } from "../types";

/** Supported HTTP methods for API endpoints. */
export type HttpMethod = "get" | "post" | "put" | "delete" | "patch" | "trace";

/**
 * Defines the request and response types for a single HTTP method
 * on an API endpoint.
 */
export interface ApiMethodDef {
	/** The type of the request body (omit for methods with no body, e.g. GET). */
	request?: AbstractType;
	/** The type of the response body. */
	response?: AbstractType;
}

/**
 * Maps HTTP methods to their request/response type definitions for
 * an API endpoint.
 */
export type ApiMethods = Partial<Record<HttpMethod, ApiMethodDef>>;

/**
 * Schema definition for a custom SurrealDB API endpoint (`DEFINE API`).
 * Stores the endpoint path and HTTP method definitions with typed
 * request/response bodies.
 *
 * Use the {@link api} factory function to create instances rather than
 * constructing this class directly.
 *
 * @typeParam Path - The endpoint path literal type.
 * @typeParam Methods - The HTTP method definitions.
 */
export class ApiEndpointSchema<
	Path extends string = string,
	Methods extends ApiMethods = ApiMethods,
> {
	constructor(
		public readonly path: Path,
		public readonly methods: Methods,
	) {}
}

/**
 * Define a custom SurrealDB API endpoint schema.
 *
 * @param path - The endpoint path (e.g. `"/users"`).
 * @param methods - An object mapping HTTP methods to their request/response type definitions.
 * @returns An {@link ApiEndpointSchema} instance.
 *
 * @example
 * ```ts
 * const usersEndpoint = api("/users", {
 *   get: { response: t.array(user.schema) },
 *   post: {
 *     request: t.object({ name: t.string(), email: t.string() }),
 *     response: user.schema,
 *   },
 * });
 * ```
 */
export function api<Path extends string, Methods extends ApiMethods>(
	path: Path,
	methods: Methods,
): ApiEndpointSchema<Path, Methods> {
	return new ApiEndpointSchema(path, methods);
}
