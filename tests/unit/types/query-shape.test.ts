import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { math, orm, t, table } from "../../../src";

/**
 * Compile-time assertions for the row types that split(), return() and the
 * where() family produce. `tsc` (run by `bun run type-check`) fails on any
 * mismatch, so these tests are about types, with a runtime check alongside.
 */

type Equal<A, B> =
	(<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2
		? true
		: false;
const assertType = <T extends true>() => undefined as unknown as T;

const article = table("article", {
	title: t.string(),
	tags: t.array(t.string()),
	rating: t.number(),
});

const db = orm(new Surreal(), article);

describe("split() row types", () => {
	test("a split array field is typed as one element; other fields keep their type", () => {
		const split = db.select("article").split("tags");
		type Row = (typeof split)["entry"]["infer"];

		assertType<Equal<Row["tags"], string>>();
		assertType<Equal<Row["title"], string>>();
		assertType<Equal<Row["rating"], number>>();
		// @ts-expect-error a split field is one element, not the whole array
		const whole: string[] = {} as Row["tags"];
		void whole;

		expect(split.toString()).toContain("SPLIT tags");
	});

	test("a return() after split() sees the element type", () => {
		const projected = db
			.select("article")
			.split("tags")
			.return((a) => ({ tag: a.tags, rating: a.rating }));
		type Projected = (typeof projected)["entry"]["infer"];

		assertType<Equal<Projected["tag"], string>>();
		assertType<Equal<Projected["rating"], number>>();
		// @ts-expect-error the projected tag is a string, not an array
		const whole: string[] = {} as Projected["tag"];
		void whole;

		expect(projected.toString()).toContain("tags AS tag");
	});

	test("a where() after split() still filters on the whole array", () => {
		const filtered = db
			.select("article")
			.split("tags")
			.where((a) => a.tags.contains("x"))
			.return((a) => ({ tag: a.tags }));

		expect(filtered.toString()).toContain("tags AS tag");
		expect(filtered.toString()).toContain("WHERE");
	});

	test("an aggregate in a grouped projection is a number", () => {
		const grouped = db
			.select("article")
			.groupAll()
			.return((a) => ({ avg: math.mean(a.rating) }));
		type Grouped = (typeof grouped)["entry"]["infer"];

		assertType<Equal<Grouped["avg"], number>>();
		expect(grouped.toString()).toContain("math::mean(rating)");
	});
});

describe("clearWhere() keeps the query's result shape", () => {
	test("an only() query still yields one row after clearWhere()", () => {
		const single = db
			.select("article")
			.where((a) => a.rating.gt(1))
			.only()
			.clearWhere()
			.where((a) => a.rating.gt(2));

		// Not executed (there is no connection here): the type alone must say the
		// query resolves to a row, not an array of rows.
		// @ts-expect-error an only() query resolves to one row, not an array
		const asRows: { execute(): Promise<unknown[]> } = single;
		void asRows;

		expect(single.toString()).toContain("ONLY");
	});
});
