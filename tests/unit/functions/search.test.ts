import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import {
	__display,
	__type,
	displayContext,
	orm,
	search,
	t,
	table,
} from "../../../src";

type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;
const assertType = <_T extends true>() => {};
type Extends<A, B> = A extends B ? true : false;
type TypeOf<X> = X extends { [__type]: infer T } ? T : never;

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

	test("search.highlight() generates search::highlight with a match reference", () => {
		const query = db.select("post").return((post) => ({
			highlighted: search.highlight(post.title, "<b>", "</b>", 1),
		}));
		const sql = query[__display](displayContext());

		expect(sql).toContain("search::highlight(");
		expect(sql).toContain(", 1)");
	});

	test("search.offsets() generates search::offsets with a match reference", () => {
		const query = db.select("post").return((post) => ({
			offsets: search.offsets(post.title, 2),
		}));
		const sql = query[__display](displayContext());

		expect(sql).toContain("search::offsets(2)");
	});

	test("search.score() takes a literal match reference, not a field", () => {
		const query = db.select("post").return((post) => ({
			score: search.score(post.title, 1),
		}));
		const sql = query[__display](displayContext());

		expect(sql).toContain("search::score(1)");
		expect(sql).not.toContain("search::score($");
		expect(sql).not.toContain("search::score($this");
	});

	test("a match reference outside 0..255 is rejected", () => {
		expect(() =>
			db.select("post").return((post) => ({
				score: search.score(post.title, 256),
			})),
		).toThrow(RangeError);
		expect(() =>
			db.select("post").return((post) => ({
				score: search.score(post.title, -1),
			})),
		).toThrow(RangeError);
		expect(() =>
			db.select("post").return((post) => ({
				score: search.score(post.title, 1.5),
			})),
		).toThrow(RangeError);
	});

	test("search() with a match reference emits @N@ instead of @@", () => {
		const query = db
			.select("post")
			.where((post) => post.title.search("hello", 1))
			.return((post) => ({ id: post.id }));
		const sql = query[__display](displayContext());

		expect(sql).toMatch(/WHERE title @1@ \$_v\d+\)/);
		expect(sql).not.toContain("@@");
	});

	test("search() without a match reference still emits @@", () => {
		const query = db
			.select("post")
			.where((post) => post.title.search("hello"))
			.return((post) => ({ id: post.id }));
		const sql = query[__display](displayContext());

		expect(sql).toMatch(/WHERE title @@ \$_v\d+\)/);
	});

	test("search() with a match reference rejects an out-of-range reference", () => {
		expect(() =>
			db
				.select("post")
				.where((post) => post.title.search("hello", 300))
				.return((post) => ({ id: post.id })),
		).toThrow(RangeError);
	});

	test("result types match what SurrealDB returns", () => {
		const text = db.value("text");
		const analyzed = search.analyze(text, text);
		const highlighted = search.highlight(text, "<b>", "</b>", 1);
		const offsets = search.offsets(text, 1);
		const score = search.score(text, 1);

		// `search::analyze` returns the token array.
		assertType<Equal<TypeOf<typeof analyzed>["infer"], string[]>>();
		assertType<Equal<TypeOf<typeof highlighted>["infer"], string>>();
		// `search::offsets` returns an object keyed by field, not a string.
		assertType<
			Extends<
				TypeOf<typeof offsets>["infer"],
				Record<string, { s: number; e: number }[]>
			>
		>();
		assertType<Equal<TypeOf<typeof score>["infer"], number>>();
	});
});
