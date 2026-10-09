import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import {
	__display,
	and,
	displayContext,
	orm,
	t,
	table,
	vector,
} from "../../../src";
import { OrmError } from "../../../src/error";

function render(query: unknown) {
	const ctx = displayContext();
	const sql = (
		query as { [__display]: (ctx: ReturnType<typeof displayContext>) => string }
	)[__display](ctx);
	return { sql, values: Object.values(ctx.variables) };
}

describe("KNN operator (vector fields)", () => {
	const doc = table("doc", {
		title: t.string(),
		embedding: t.array(t.number()),
		tags: t.array(t.string()),
	});

	const db = orm(new Surreal(), doc);

	test("where(knn) renders the metric form <|k,METRIC|> with the query bound", () => {
		const q = db
			.select("doc")
			.where((d) => d.embedding.knn([1, 0, 0], 2, { metric: "COSINE" }));
		const { sql, values } = render(q);

		expect(sql).toContain("WHERE (embedding <|2,COSINE|> $_v");
		expect(values).toContainEqual([1, 0, 0]);
	});

	test("the metric is rendered verbatim for each supported metric", () => {
		for (const metric of [
			"EUCLIDEAN",
			"COSINE",
			"MANHATTAN",
			"CHEBYSHEV",
		] as const) {
			const q = db
				.select("doc")
				.where((d) => d.embedding.knn([1, 0], 3, { metric }));
			expect(render(q).sql).toContain(`<|3,${metric}|>`);
		}
	});

	test("the HNSW form <|k,ef|> renders when given an ef", () => {
		const q = db
			.select("doc")
			.where((d) => d.embedding.knn([1, 0, 0], 10, { ef: 40 }));
		expect(render(q).sql).toContain("(embedding <|10,40|> $_v");
	});

	test("knn composes with other conditions through and()", () => {
		const q = db
			.select("doc")
			.where((d) =>
				and(
					d.embedding.knn([1, 0, 0], 5, { metric: "EUCLIDEAN" }),
					d.title.eq("x"),
				),
			);
		const { sql } = render(q);

		expect(sql).toContain("<|5,EUCLIDEAN|>");
		expect(sql).toContain("AND");
	});

	test("the distance of the KNN operator is rendered as vector::distance::knn()", () => {
		const q = db.select("doc").return((d) => ({
			title: d.title,
			distance: vector.distanceKnn(d),
		}));
		const { sql } = render(q);

		expect(sql).toContain("vector::distance::knn()");
	});

	test("rejects k that is not a positive integer", () => {
		const d = db.select("doc");
		for (const k of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() =>
				d.where((doc) => doc.embedding.knn([1], k, { metric: "COSINE" })),
			).toThrow(OrmError);
		}
	});

	test("rejects an ef that is not a positive integer", () => {
		const d = db.select("doc");
		for (const ef of [0, -4, 2.5]) {
			expect(() => d.where((doc) => doc.embedding.knn([1], 2, { ef }))).toThrow(
				OrmError,
			);
		}
	});

	test("rejects a metric outside the whitelist (no SurrealQL injection)", () => {
		const d = db.select("doc");
		expect(() =>
			d.where((doc) =>
				doc.embedding.knn([1], 2, {
					metric: "COSINE|> 1 OR true OR <|1" as "COSINE",
				}),
			),
		).toThrow(OrmError);
	});

	test("throws at build time when knn is called on a non-vector array", () => {
		const d = db.select("doc");
		expect(() =>
			d.where((doc) =>
				(
					doc.tags as unknown as {
						knn: (q: number[], k: number, o: object) => never;
					}
				).knn([1], 2, { metric: "COSINE" }),
			),
		).toThrow(OrmError);
	});

	test("type-level: knn is available on array<number> fields only", () => {
		// Compile-time assertions only: this branch never runs, so the calls that
		// are wrong on purpose cannot throw at runtime.
		const typeOnly = false as boolean;
		if (typeOnly) {
			db.select("doc").where((d) =>
				d.embedding.knn([1], 2, { metric: "COSINE" }),
			);
			// @ts-expect-error knn needs a metric or an ef
			db.select("doc").where((d) => d.embedding.knn([1], 2));
			db.select("doc").where((d) =>
				// @ts-expect-error unknown metric
				d.embedding.knn([1], 2, { metric: "NOT_A_METRIC" }),
			);
			// @ts-expect-error knn is not defined on array<string>
			db.select("doc").where((d) => d.tags.knn([1], 2, { metric: "COSINE" }));
			// @ts-expect-error knn is not defined on a string field
			db.select("doc").where((d) => d.title.knn([1], 2, { metric: "COSINE" }));
		}
		expect(typeOnly).toBe(false);
	});
});
