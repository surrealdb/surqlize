import { describe, expect, test } from "bun:test";
import type { SurrealSession } from "surrealdb";
import { ApiClient, api, TypeParseError, t } from "../../../src";

/**
 * Creates a mock SurrealSession whose `.api().invoke()` returns
 * the given response. This lets us test ApiClient's parsing and
 * delegation logic without a real database.
 */
function mockSurreal(invokeResult: unknown): SurrealSession {
	return {
		api() {
			return {
				invoke: () => Promise.resolve(invokeResult),
			};
		},
	} as unknown as SurrealSession;
}

describe("ApiClient", () => {
	describe("response parsing", () => {
		test("get() parses response body through the schema", async () => {
			const surreal = mockSurreal({
				status: 200,
				body: "hello",
			});

			const endpoint = api("/test", {
				get: { response: t.string() },
			});

			const client = new ApiClient(surreal, [endpoint]);
			const response = await client.get("/test");

			expect(response.status).toBe(200);
			expect(response.body).toBe("hello");
		});

		test("post() passes body and parses response", async () => {
			const surreal = mockSurreal({
				status: 201,
				body: { id: "123", name: "Alice" },
			});

			const endpoint = api("/users", {
				post: {
					request: t.object({ name: t.string() }),
					response: t.object({ id: t.string(), name: t.string() }),
				},
			});

			const client = new ApiClient(surreal, [endpoint]);
			const response = await client.post("/users", { name: "Alice" });

			expect(response.status).toBe(201);
			expect(response.body).toEqual({ id: "123", name: "Alice" });
		});

		test("put() delegates correctly", async () => {
			const surreal = mockSurreal({
				status: 200,
				body: { updated: true },
			});

			const endpoint = api("/item", {
				put: {
					request: t.object({ value: t.number() }),
					response: t.object({ updated: t.bool() }),
				},
			});

			const client = new ApiClient(surreal, [endpoint]);
			const response = await client.put("/item", { value: 42 });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ updated: true });
		});

		test("delete() delegates correctly", async () => {
			const surreal = mockSurreal({
				status: 200,
				body: { deleted: true },
			});

			const endpoint = api("/item", {
				delete: { response: t.object({ deleted: t.bool() }) },
			});

			const client = new ApiClient(surreal, [endpoint]);
			const response = await client.delete("/item");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ deleted: true });
		});

		test("patch() delegates correctly", async () => {
			const surreal = mockSurreal({
				status: 200,
				body: { patched: true },
			});

			const endpoint = api("/item", {
				patch: {
					request: t.object({ field: t.string() }),
					response: t.object({ patched: t.bool() }),
				},
			});

			const client = new ApiClient(surreal, [endpoint]);
			const response = await client.patch("/item", { field: "value" });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ patched: true });
		});
	});

	describe("schema validation", () => {
		test("throws TypeParseError when body does not match response schema", async () => {
			const surreal = mockSurreal({
				status: 200,
				body: "not_a_number",
			});

			const endpoint = api("/typed", {
				get: { response: t.number() },
			});

			const client = new ApiClient(surreal, [endpoint]);

			expect(client.get("/typed")).rejects.toThrow(TypeParseError);
		});

		test("returns undefined body as-is without parsing", async () => {
			const surreal = mockSurreal({
				status: 204,
				body: undefined,
			});

			const endpoint = api("/empty", {
				get: { response: t.string() },
			});

			const client = new ApiClient(surreal, [endpoint]);
			const response = await client.get("/empty");

			expect(response.status).toBe(204);
			expect(response.body).toBeUndefined();
		});

		test("returns body unparsed when endpoint has no response schema", async () => {
			const surreal = mockSurreal({
				status: 200,
				body: { anything: "goes" },
			});

			const endpoint = api("/untyped", {
				get: {},
			});

			const client = new ApiClient(surreal, [endpoint]);
			const response = await client.get("/untyped");

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ anything: "goes" });
		});

		test("validates complex nested response types", async () => {
			const surreal = mockSurreal({
				status: 200,
				body: { users: ["Alice", "Bob"] },
			});

			const endpoint = api("/complex", {
				get: {
					response: t.object({
						users: t.array(t.string()),
					}),
				},
			});

			const client = new ApiClient(surreal, [endpoint]);
			const response = await client.get("/complex");

			expect(response.body).toEqual({ users: ["Alice", "Bob"] });
		});
	});
});
