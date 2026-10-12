import { describe, expect, test } from "bun:test";
import { and, not, orm, t, table, vector } from "../../src";
import { withTestDb } from "./setup";

const doc = table("doc", {
	title: t.string(),
	age: t.number(),
	embedding: t.array(t.number()),
});

describe("KNN operator and ORDER BY expressions (integration)", () => {
	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await surreal.query(`
				DEFINE INDEX doc_embedding ON doc FIELDS embedding HNSW DIMENSION 3 DIST EUCLIDEAN;

				CREATE doc:a SET title = "alpha", age = 1, embedding = [1, 0, 0];
				CREATE doc:b SET title = "beta", age = 2, embedding = [0, 1, 0];
				CREATE doc:c SET title = "gamma", age = 3, embedding = [1, 1, 0];
				CREATE doc:d SET title = "delta", age = 4, embedding = [0, 0, 5];
				CREATE doc:e SET title = "epsilon", age = 5, embedding = [0.9, 0.1, 0];
			`);
		},
	});

	const query = [1, 0, 0];

	test("brute-force knn with a metric returns the k nearest, ordered by the distance expression", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, doc);

		const rows = await db
			.select("doc")
			.where((d) => d.embedding.knn(query, 3, { metric: "EUCLIDEAN" }))
			.orderBy((d) => vector.distanceKnn(d), "ASC")
			.execute();

		expect(rows.map((r) => r.title)).toEqual(["alpha", "epsilon", "gamma"]);
	});

	test("the sort key added for a distance expression is not present in the returned rows", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, doc);

		const rows = await db
			.select("doc")
			.where((d) => d.embedding.knn(query, 2, { metric: "EUCLIDEAN" }))
			.orderBy((d) => vector.distanceKnn(d), "ASC")
			.execute();

		for (const row of rows) {
			expect(Object.keys(row).filter((k) => k.startsWith("__order"))).toEqual(
				[],
			);
		}
	});

	test("return() exposes the KNN distance as a projected field", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, doc);

		const rows = await db
			.select("doc")
			.where((d) => d.embedding.knn(query, 3, { metric: "EUCLIDEAN" }))
			.return((d) => ({
				title: d.title,
				distance: vector.distanceKnn(d),
			}))
			.execute();

		const byTitle = Object.fromEntries(rows.map((r) => [r.title, r.distance]));
		expect(Object.keys(byTitle).sort()).toEqual(["alpha", "epsilon", "gamma"]);
		expect(byTitle.alpha).toBeCloseTo(0, 6);
		expect(byTitle.epsilon).toBeCloseTo(Math.hypot(0.1, 0.1), 6);
		expect(byTitle.gamma).toBeCloseTo(1, 6);
	});

	test("cosine metric ranks by angle, not by magnitude", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, doc);

		const rows = await db
			.select("doc")
			.where((d) => d.embedding.knn(query, 2, { metric: "COSINE" }))
			.execute();

		expect(rows.map((r) => r.title).sort()).toEqual(["alpha", "epsilon"]);
	});

	test("the HNSW form <|k,ef|> works against an HNSW index", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, doc);

		const rows = await db
			.select("doc")
			.where((d) => d.embedding.knn(query, 3, { ef: 40 }))
			.execute();

		expect(rows.map((r) => r.title).sort()).toEqual([
			"alpha",
			"epsilon",
			"gamma",
		]);
	});

	test("knn composes with an extra condition in where()", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, doc);

		const rows = await db
			.select("doc")
			.where((d) =>
				and(
					d.embedding.knn(query, 3, { metric: "EUCLIDEAN" }),
					not(d.title.eq("alpha")),
				),
			)
			.execute();

		expect(rows.length).toBeLessThanOrEqual(3);
		expect(rows.map((r) => r.title)).not.toContain("alpha");
		expect(rows.map((r) => r.title)).toContain("epsilon");
	});

	test("ORDER BY a function expression sorts the whole table", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, doc);

		const rows = await db
			.select("doc")
			.orderBy((d) => vector.magnitude(d.embedding), "DESC")
			.execute();

		// magnitudes: delta 5, gamma ~1.41, alpha/beta 1, epsilon ~0.91
		expect(rows[0]!.title).toBe("delta");
		expect(rows[1]!.title).toBe("gamma");
		expect(rows[rows.length - 1]!.title).toBe("epsilon");
		expect(rows.length).toBe(5);
		for (const row of rows) {
			expect(Object.keys(row).some((k) => k.startsWith("__order"))).toBe(false);
		}
	});

	test("an expression sort works with LIMIT and with a field key", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, doc);

		const rows = await db
			.select("doc")
			.orderBy("age", "ASC")
			.orderBy((d) => vector.magnitude(d.embedding), "DESC")
			.limit(2)
			.execute();

		expect(rows.map((r) => r.title)).toEqual(["alpha", "beta"]);
	});

	test("two expression sorts keep their order and drop both sort keys", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, doc);

		const rows = await db
			.select("doc")
			.orderBy((d) => vector.magnitude(d.embedding), "DESC")
			.orderBy((d) => vector.dot(d.embedding, d.embedding), "ASC")
			.execute();

		expect(rows[0]!.title).toBe("delta");
		expect(rows[rows.length - 1]!.title).toBe("epsilon");
		for (const row of rows) {
			expect(Object.keys(row).some((k) => k.startsWith("__order"))).toBe(false);
		}
	});

	test("field-name ORDER BY keeps working unchanged", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, doc);

		const rows = await db.select("doc").orderBy("age", "DESC").execute();
		expect(rows.map((r) => r.age)).toEqual([5, 4, 3, 2, 1]);
	});
});
