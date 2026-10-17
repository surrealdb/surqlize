import { describe, expect, test } from "bun:test";
import { type SurrealSession, UnsuccessfulApiError } from "surrealdb";
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

	describe("non-success status", () => {
		const typed = api("/typed", {
			get: { response: t.object({ message: t.string() }) },
		});

		/** The error a call rejected with, so a test can read what it carries. */
		async function rejection(promise: Promise<unknown>): Promise<unknown> {
			try {
				await promise;
			} catch (err) {
				return err;
			}
			throw new Error("expected the call to reject");
		}

		test("a 404 whose body is not the success type is not parsed against it", async () => {
			const surreal = mockSurreal({ status: 404, body: "no such thing" });
			const client = new ApiClient(surreal, [typed]);

			const err = await rejection(client.get("/typed"));

			expect(err).not.toBeInstanceOf(TypeParseError);
			expect(err).toBeInstanceOf(UnsuccessfulApiError);
		});

		test("the error carries the status and the raw body", async () => {
			const surreal = mockSurreal({
				status: 500,
				body: "An error occurred: boom",
				headers: { "x-a": "b" },
			});
			const client = new ApiClient(surreal, [typed]);

			const err = (await rejection(
				client.get("/typed"),
			)) as UnsuccessfulApiError;

			expect(err.response.status).toBe(500);
			expect(err.response.body).toBe("An error occurred: boom");
			expect(err.response.headers).toEqual({ "x-a": "b" });
			expect(err.path).toBe("/typed");
			expect(err.method).toBe("get");
			expect(err.message).toContain("500");
		});

		test("a failure body that fits the success type is still a failure", async () => {
			const surreal = mockSurreal({ status: 404, body: { message: "gone" } });
			const client = new ApiClient(surreal, [typed]);

			const err = (await rejection(
				client.get("/typed"),
			)) as UnsuccessfulApiError;

			expect(err).toBeInstanceOf(UnsuccessfulApiError);
			expect(err.response.body).toEqual({ message: "gone" });
		});

		test("a failure with no body is a failure", async () => {
			const surreal = mockSurreal({ status: 404 });
			const client = new ApiClient(surreal, [typed]);

			const err = await rejection(client.get("/typed"));

			expect(err).toBeInstanceOf(UnsuccessfulApiError);
		});

		test("an endpoint with no response schema fails the same way", async () => {
			const surreal = mockSurreal({ status: 404, body: "no such thing" });
			const client = new ApiClient(surreal, [api("/untyped", { get: {} })]);

			const err = await rejection(client.get("/untyped"));

			expect(err).toBeInstanceOf(UnsuccessfulApiError);
		});

		test("every method reports a failure", async () => {
			const surreal = mockSurreal({ status: 400, body: "bad" });
			const endpoint = api("/item", {
				post: { response: t.object({ message: t.string() }) },
				put: { response: t.object({ message: t.string() }) },
				delete: { response: t.object({ message: t.string() }) },
				patch: { response: t.object({ message: t.string() }) },
				trace: { response: t.object({ message: t.string() }) },
			});
			const client = new ApiClient(surreal, [endpoint]);

			for (const call of [
				() => client.post("/item"),
				() => client.put("/item"),
				() => client.delete("/item"),
				() => client.patch("/item"),
				() => client.trace("/item"),
			]) {
				expect(await rejection(call())).toBeInstanceOf(UnsuccessfulApiError);
			}
		});

		test("every 2xx status is a success, and anything outside 2xx is not", async () => {
			const body = { message: "hi" };
			for (const status of [200, 201, 204, 299]) {
				const client = new ApiClient(mockSurreal({ status, body }), [typed]);
				expect((await client.get("/typed")).status).toBe(status);
			}
			for (const status of [199, 300, 302, 400, 503]) {
				const client = new ApiClient(mockSurreal({ status, body }), [typed]);
				expect(await rejection(client.get("/typed"))).toBeInstanceOf(
					UnsuccessfulApiError,
				);
			}
		});

		test("a response without a status is left as it was", async () => {
			const surreal = mockSurreal({ body: { message: "hi" } });
			const client = new ApiClient(surreal, [typed]);

			const response = await client.get("/typed");

			expect(response.status).toBeUndefined();
			expect(response.body).toEqual({ message: "hi" });
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
