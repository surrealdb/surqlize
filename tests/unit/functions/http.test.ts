import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { http, __display, displayContext, orm, t, table } from "../../../src";

describe("HTTP functions", () => {
	const resource = table("resource", {
		url: t.string(),
		body: t.string(),
	});

	const db = orm(new Surreal(), resource);

	test("http.head() generates http::head", () => {
		const query = db.select("resource").return((res) => ({
			result: http.head(res.url),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("http::head");
	});

	test("http.get() generates http::get", () => {
		const query = db.select("resource").return((res) => ({
			result: http.get(res.url),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("http::get");
	});

	test("http.put() generates http::put", () => {
		const query = db.select("resource").return((res) => ({
			result: http.put(res.url, res.body),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("http::put");
	});

	test("http.post() generates http::post", () => {
		const query = db.select("resource").return((res) => ({
			result: http.post(res.url, res.body),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("http::post");
	});

	test("http.patch() generates http::patch", () => {
		const query = db.select("resource").return((res) => ({
			result: http.patch(res.url, res.body),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("http::patch");
	});

	test("http.del() generates http::delete", () => {
		const query = db.select("resource").return((res) => ({
			result: http.del(res.url),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("http::delete");
	});
});
