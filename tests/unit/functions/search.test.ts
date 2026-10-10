import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, search, t, table } from "../../../src";

describe("Search functions", () => {
	const post = table("post", {
		title: t.string(),
		body: t.string(),
	});

	const db = orm(new Surreal(), post);

	test("search.analyze() generates search::analyze", () => {
		const query = db.select("post").return((post) => ({
			tokens: search.analyze(post.title, post.body),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("search::analyze");
	});

	test("search.highlight() generates search::highlight", () => {
		const query = db.select("post").return((post) => ({
			highlighted: search.highlight(post.title, post.body, post.title),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("search::highlight");
	});

	test("search.offsets() generates search::offsets", () => {
		const query = db.select("post").return((post) => ({
			offsets: search.offsets(post.title),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("search::offsets");
	});

	test("search.score() generates search::score", () => {
		const query = db.select("post").return((post) => ({
			score: search.score(post.title),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("search::score");
	});
});
