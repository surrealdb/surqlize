import { describe, expect, test } from "bun:test";
import { ApiEndpointSchema, api, t } from "../../../src";

describe("ApiEndpointSchema", () => {
	test("creates schema with path and methods", () => {
		const endpoint = new ApiEndpointSchema("/users", {
			get: { response: t.array(t.string()) },
		});

		expect(endpoint.path).toBe("/users");
		expect(endpoint.methods.get).toBeDefined();
		expect(endpoint.methods.get!.response!.name).toBe("array");
	});

	test("creates schema with multiple methods", () => {
		const endpoint = new ApiEndpointSchema("/users", {
			get: { response: t.array(t.string()) },
			post: {
				request: t.object({ name: t.string() }),
				response: t.object({ id: t.string(), name: t.string() }),
			},
			delete: {},
		});

		expect(endpoint.methods.get).toBeDefined();
		expect(endpoint.methods.post).toBeDefined();
		expect(endpoint.methods.delete).toBeDefined();
		expect("put" in endpoint.methods).toBe(false);
	});

	test("handles request and response types", () => {
		const endpoint = new ApiEndpointSchema("/data", {
			post: {
				request: t.object({ key: t.string(), value: t.number() }),
				response: t.bool(),
			},
		});

		expect(endpoint.methods.post!.request!.name).toBe("object");
		expect(endpoint.methods.post!.response!.name).toBe("bool");
	});
});

describe("api() factory", () => {
	test("creates an ApiEndpointSchema", () => {
		const endpoint = api("/users", {
			get: { response: t.array(t.string()) },
		});

		expect(endpoint).toBeInstanceOf(ApiEndpointSchema);
		expect(endpoint.path).toBe("/users");
	});

	test("preserves typed path", () => {
		const endpoint = api("/users/active", {
			get: { response: t.number() },
		});

		expect(endpoint.path).toBe("/users/active");
	});

	test("supports all HTTP methods", () => {
		const endpoint = api("/test", {
			get: { response: t.string() },
			post: { request: t.string(), response: t.string() },
			put: { request: t.string(), response: t.string() },
			delete: { response: t.bool() },
			patch: { request: t.string(), response: t.string() },
			trace: { response: t.string() },
		});

		expect(endpoint.methods.get).toBeDefined();
		expect(endpoint.methods.post).toBeDefined();
		expect(endpoint.methods.put).toBeDefined();
		expect(endpoint.methods.delete).toBeDefined();
		expect(endpoint.methods.patch).toBeDefined();
		expect(endpoint.methods.trace).toBeDefined();
	});
});
