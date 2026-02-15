import type { SurrealSession } from "surrealdb";
import type {
	ApiEndpointSchema,
	ApiMethodDef,
	ApiMethods,
	HttpMethod,
} from "../schema/api";
import type { AbstractType } from "../types";

// ---------------------------------------------------------------------------
// Type-level helpers
// ---------------------------------------------------------------------------

/**
 * Builds a type-level map from endpoint path to its method definitions.
 * Given `[ApiEndpointSchema<"/users", M1>, ApiEndpointSchema<"/posts", M2>]`,
 * produces `{ "/users": M1; "/posts": M2 }`.
 */
type EndpointsMap<E extends ApiEndpointSchema[]> = {
	[K in E[number] as K["path"]]: K["methods"];
};

/**
 * Extracts the set of endpoint paths that support a given HTTP method.
 */
type PathsForMethod<Map, M extends HttpMethod> = {
	[P in keyof Map]: M extends keyof Map[P] ? P : never;
}[keyof Map] &
	string;

/**
 * Extracts the inferred response type for a given path and method.
 */
type ResponseType<
	Map,
	P extends string,
	M extends HttpMethod,
> = P extends keyof Map
	? M extends keyof Map[P]
		? Map[P][M] extends { response: AbstractType }
			? Map[P][M]["response"]["infer"]
			: unknown
		: unknown
	: unknown;

/**
 * Extracts the inferred request body type for a given path and method.
 */
type RequestType<
	Map,
	P extends string,
	M extends HttpMethod,
> = P extends keyof Map
	? M extends keyof Map[P]
		? Map[P][M] extends { request: AbstractType }
			? Map[P][M]["request"]["infer"]
			: undefined
		: undefined
	: undefined;

/**
 * The response shape returned by API endpoints.
 */
export interface ApiResponse<T> {
	body?: T;
	headers?: Record<string, string>;
	status?: number;
}

// ---------------------------------------------------------------------------
// ApiClient
// ---------------------------------------------------------------------------

/**
 * A type-safe wrapper around the SurrealDB SDK's `SurrealApi` that validates
 * responses against Surqlize endpoint schemas.
 *
 * Created via `db.api()` on an {@link Orm} instance.
 *
 * @typeParam E - Tuple of {@link ApiEndpointSchema} types.
 */
export class ApiClient<E extends ApiEndpointSchema[] = ApiEndpointSchema[]> {
	private schemas: Map<string, ApiMethods>;

	constructor(
		private readonly surreal: SurrealSession,
		endpoints: E,
	) {
		this.schemas = new Map();
		for (const ep of endpoints) {
			this.schemas.set(ep.path, ep.methods);
		}
	}

	// -------------------------------------------------------------------
	// Internal helpers
	// -------------------------------------------------------------------

	private getMethodDef(
		path: string,
		method: HttpMethod,
	): ApiMethodDef | undefined {
		return this.schemas.get(path)?.[method];
	}

	private parseBody(body: unknown, path: string, method: HttpMethod): unknown {
		const def = this.getMethodDef(path, method);
		if (def?.response && body !== undefined) {
			return def.response.parse(body);
		}
		return body;
	}

	private async invoke<T>(
		path: string,
		method: HttpMethod,
		body?: unknown,
	): Promise<ApiResponse<T>> {
		const sdkApi = this.surreal.api();
		const response = (await sdkApi.invoke(path, {
			method,
			body,
		})) as ApiResponse<unknown>;
		response.body = this.parseBody(response.body, path, method);
		return response as ApiResponse<T>;
	}

	// -------------------------------------------------------------------
	// Public API
	// -------------------------------------------------------------------

	/**
	 * Invoke a user-defined GET API endpoint.
	 *
	 * @param path - The endpoint path.
	 * @returns The typed API response.
	 */
	get<P extends PathsForMethod<EndpointsMap<E>, "get">>(
		path: P,
	): Promise<ApiResponse<ResponseType<EndpointsMap<E>, P, "get">>> {
		return this.invoke(path, "get");
	}

	/**
	 * Invoke a user-defined POST API endpoint.
	 *
	 * @param path - The endpoint path.
	 * @param body - The request body.
	 * @returns The typed API response.
	 */
	post<P extends PathsForMethod<EndpointsMap<E>, "post">>(
		path: P,
		body?: RequestType<EndpointsMap<E>, P, "post">,
	): Promise<ApiResponse<ResponseType<EndpointsMap<E>, P, "post">>> {
		return this.invoke(path, "post", body);
	}

	/**
	 * Invoke a user-defined PUT API endpoint.
	 *
	 * @param path - The endpoint path.
	 * @param body - The request body.
	 * @returns The typed API response.
	 */
	put<P extends PathsForMethod<EndpointsMap<E>, "put">>(
		path: P,
		body?: RequestType<EndpointsMap<E>, P, "put">,
	): Promise<ApiResponse<ResponseType<EndpointsMap<E>, P, "put">>> {
		return this.invoke(path, "put", body);
	}

	/**
	 * Invoke a user-defined DELETE API endpoint.
	 *
	 * @param path - The endpoint path.
	 * @param body - Optional request body.
	 * @returns The typed API response.
	 */
	delete<P extends PathsForMethod<EndpointsMap<E>, "delete">>(
		path: P,
		body?: RequestType<EndpointsMap<E>, P, "delete">,
	): Promise<ApiResponse<ResponseType<EndpointsMap<E>, P, "delete">>> {
		return this.invoke(path, "delete", body);
	}

	/**
	 * Invoke a user-defined PATCH API endpoint.
	 *
	 * @param path - The endpoint path.
	 * @param body - The request body.
	 * @returns The typed API response.
	 */
	patch<P extends PathsForMethod<EndpointsMap<E>, "patch">>(
		path: P,
		body?: RequestType<EndpointsMap<E>, P, "patch">,
	): Promise<ApiResponse<ResponseType<EndpointsMap<E>, P, "patch">>> {
		return this.invoke(path, "patch", body);
	}

	/**
	 * Invoke a user-defined TRACE API endpoint.
	 *
	 * @param path - The endpoint path.
	 * @param body - Optional request body.
	 * @returns The typed API response.
	 */
	trace<P extends PathsForMethod<EndpointsMap<E>, "trace">>(
		path: P,
		body?: RequestType<EndpointsMap<E>, P, "trace">,
	): Promise<ApiResponse<ResponseType<EndpointsMap<E>, P, "trace">>> {
		return this.invoke(path, "trace", body);
	}
}
