import { describe, expect, test } from "bun:test";
import { UnsuccessfulApiError } from "surrealdb";
import { api, TypeParseError, t } from "../../src";
import { atLeast, serverVersion } from "../helpers/db";
import { withTestDb } from "./setup";

// A handler that THROWs answers 500 on 3.2.3; earlier servers are unchecked.
const throwAnswers500 = atLeast(await serverVersion(), 3, 2);

/**
 * These tests require SurrealDB v3.0.0+ started with experimental API support:
 *   SURREAL_CAPS_ALLOW_EXPERIMENTAL=define_api surreal start ...
 *
 * Tests will skip gracefully if DEFINE API is not available.
 */
describe("DEFINE API integration tests", () => {
	const getTestDb = withTestDb({ perTest: true });

	/**
	 * Helper: attempt to define an API endpoint on the server.
	 * Returns false if the feature is not available.
	 */
	async function defineApiAvailable(
		surreal: ReturnType<typeof getTestDb>["surreal"],
	): Promise<boolean> {
		try {
			await surreal.query(`
				DEFINE API "/health_check" FOR get THEN {
					{ status: 200, body: "ok" };
				};
			`);
			return true;
		} catch {
			return false;
		}
	}

	test("GET endpoint returns typed response", async () => {
		const { db, surreal } = getTestDb();

		if (!(await defineApiAvailable(surreal))) {
			console.log("  ⏭ Skipping: DEFINE API not available");
			return;
		}

		await surreal.query(`
			DEFINE API "/greeting" FOR get THEN {
				{
					status: 200,
					body: { message: "Hello from API" }
				};
			};
		`);

		const greetingEndpoint = api("/greeting", {
			get: {
				response: t.object({ message: t.string() }),
			},
		});

		const client = db.api(greetingEndpoint);
		const response = await client.get("/greeting");

		expect(response.status).toBe(200);
		expect(response.body).toBeDefined();
		expect(response.body!.message).toBe("Hello from API");
	});

	test("POST endpoint with request body", async () => {
		const { db, surreal } = getTestDb();

		if (!(await defineApiAvailable(surreal))) {
			console.log("  ⏭ Skipping: DEFINE API not available");
			return;
		}

		await surreal.query(`
			DEFINE API "/echo" FOR post THEN {
				{
					status: 200,
					body: $request.body
				};
			};
		`);

		const echoEndpoint = api("/echo", {
			post: {
				request: t.object({ text: t.string() }),
				response: t.object({ text: t.string() }),
			},
		});

		const client = db.api(echoEndpoint);
		const response = await client.post("/echo", { text: "hello" });

		expect(response.status).toBe(200);
		expect(response.body).toBeDefined();
		expect(response.body!.text).toBe("hello");
	});

	test("multiple endpoints on one client", async () => {
		const { db, surreal } = getTestDb();

		if (!(await defineApiAvailable(surreal))) {
			console.log("  ⏭ Skipping: DEFINE API not available");
			return;
		}

		await surreal.query(`
			DEFINE API "/status" FOR get THEN {
				{ status: 200, body: { ok: true } };
			};
			DEFINE API "/version" FOR get THEN {
				{ status: 200, body: { version: "1.0.0" } };
			};
		`);

		const statusEndpoint = api("/status", {
			get: { response: t.object({ ok: t.bool() }) },
		});
		const versionEndpoint = api("/version", {
			get: { response: t.object({ version: t.string() }) },
		});

		const client = db.api(statusEndpoint, versionEndpoint);

		const status = await client.get("/status");
		expect(status.body!.ok).toBe(true);

		const version = await client.get("/version");
		expect(version.body!.version).toBe("1.0.0");
	});

	test("PUT endpoint with request body", async () => {
		const { db, surreal } = getTestDb();

		if (!(await defineApiAvailable(surreal))) {
			console.log("  ⏭ Skipping: DEFINE API not available");
			return;
		}

		await surreal.query(`
			DEFINE API "/item" FOR put THEN {
				{
					status: 200,
					body: { replaced: true, data: $request.body }
				};
			};
		`);

		const itemEndpoint = api("/item", {
			put: {
				request: t.object({ name: t.string() }),
				response: t.object({
					replaced: t.bool(),
					data: t.object({ name: t.string() }),
				}),
			},
		});

		const client = db.api(itemEndpoint);
		const response = await client.put("/item", { name: "updated" });

		expect(response.status).toBe(200);
		expect(response.body!.replaced).toBe(true);
		expect(response.body!.data.name).toBe("updated");
	});

	test("DELETE endpoint", async () => {
		const { db, surreal } = getTestDb();

		if (!(await defineApiAvailable(surreal))) {
			console.log("  ⏭ Skipping: DEFINE API not available");
			return;
		}

		await surreal.query(`
			DEFINE API "/item" FOR delete THEN {
				{
					status: 200,
					body: { deleted: true }
				};
			};
		`);

		const itemEndpoint = api("/item", {
			delete: {
				response: t.object({ deleted: t.bool() }),
			},
		});

		const client = db.api(itemEndpoint);
		const response = await client.delete("/item");

		expect(response.status).toBe(200);
		expect(response.body!.deleted).toBe(true);
	});

	test("PATCH endpoint with request body", async () => {
		const { db, surreal } = getTestDb();

		if (!(await defineApiAvailable(surreal))) {
			console.log("  ⏭ Skipping: DEFINE API not available");
			return;
		}

		await surreal.query(`
			DEFINE API "/item" FOR patch THEN {
				{
					status: 200,
					body: { patched: true, field: $request.body.field }
				};
			};
		`);

		const itemEndpoint = api("/item", {
			patch: {
				request: t.object({ field: t.string() }),
				response: t.object({ patched: t.bool(), field: t.string() }),
			},
		});

		const client = db.api(itemEndpoint);
		const response = await client.patch("/item", { field: "value" });

		expect(response.status).toBe(200);
		expect(response.body!.patched).toBe(true);
		expect(response.body!.field).toBe("value");
	});

	test("throws TypeParseError when response body does not match schema", async () => {
		const { db, surreal } = getTestDb();

		if (!(await defineApiAvailable(surreal))) {
			console.log("  ⏭ Skipping: DEFINE API not available");
			return;
		}

		// Endpoint returns a string, but schema expects a number
		await surreal.query(`
			DEFINE API "/wrong_type" FOR get THEN {
				{
					status: 200,
					body: "i am a string"
				};
			};
		`);

		const endpoint = api("/wrong_type", {
			get: { response: t.number() },
		});

		const client = db.api(endpoint);

		try {
			await client.get("/wrong_type");
			// Should not reach here
			expect(true).toBe(false);
		} catch (err) {
			expect(err).toBeInstanceOf(TypeParseError);
		}
	});

	test("a 404 is an error carrying its status and body, not parsed as the success type", async () => {
		const { db, surreal } = getTestDb();

		if (!(await defineApiAvailable(surreal))) {
			console.log("  ⏭ Skipping: DEFINE API not available");
			return;
		}

		await surreal.query(`
			DEFINE API "/missing" FOR get THEN {
				{ status: 404, body: "no such thing" };
			};
			DEFINE API "/missing_shaped" FOR get THEN {
				{ status: 404, body: { message: "gone" } };
			};
		`);

		const client = db.api(
			api("/missing", {
				get: { response: t.object({ message: t.string() }) },
			}),
			api("/missing_shaped", {
				get: { response: t.object({ message: t.string() }) },
			}),
		);

		// A body that is not the success type is not parsed against it.
		try {
			await client.get("/missing");
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(UnsuccessfulApiError);
			const { response } = err as UnsuccessfulApiError;
			expect(response.status).toBe(404);
			expect(response.body).toBe("no such thing");
		}

		// A body that happens to fit it is still a failure.
		try {
			await client.get("/missing_shaped");
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(UnsuccessfulApiError);
			const { response } = err as UnsuccessfulApiError;
			expect(response.status).toBe(404);
			expect(response.body).toEqual({ message: "gone" });
		}
	});

	test.skipIf(!throwAnswers500)(
		"a handler that throws is an error carrying its status",
		async () => {
			const { db, surreal } = getTestDb();

			if (!(await defineApiAvailable(surreal))) {
				console.log("  ⏭ Skipping: DEFINE API not available");
				return;
			}

			await surreal.query(`
				DEFINE API "/boom" FOR get THEN {
					THROW "boom";
				};
			`);

			const client = db.api(
				api("/boom", {
					get: { response: t.object({ message: t.string() }) },
				}),
			);

			try {
				await client.get("/boom");
				expect.unreachable();
			} catch (err) {
				expect(err).toBeInstanceOf(UnsuccessfulApiError);
				const { response } = err as UnsuccessfulApiError;
				expect(response.status).toBe(500);
				expect(String(response.body)).toContain("boom");
			}
		},
	);
});
