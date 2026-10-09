import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table, vector } from "../../../src";

describe("Vector functions", () => {
	const doc = table("doc", {
		embedding: t.array(t.number()),
		age: t.number(),
	});

	const db = orm(new Surreal(), doc);

	test("vector.dot() generates vector::dot", () => {
		const query = db.select("doc").return((doc) => ({
			dotProduct: vector.dot(doc.embedding, doc.embedding),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("vector::dot");
	});

	test("a plain array argument is bound as a vector literal next to a field", () => {
		const ctx = displayContext();
		const query = db.select("doc").return((doc) => ({
			similarity: vector.similarityCosine(doc.embedding, [1, 0, 0]),
		}));
		const sql = query[__display](ctx);

		expect(sql).toContain("vector::similarity::cosine(");
		expect(Object.values(ctx.variables)).toContainEqual([1, 0, 0]);
	});

	test("a plain array can be the first argument when the second is a field", () => {
		const ctx = displayContext();
		const query = db.select("doc").return((doc) => ({
			similarity: vector.similarityCosine([1, 0, 0], doc.embedding),
		}));
		const sql = query[__display](ctx);

		expect(sql).toMatch(/vector::similarity::cosine\(\$_v\d+, /);
		expect(Object.values(ctx.variables)).toContainEqual([1, 0, 0]);
	});

	test("a plain array works for three-operand functions too", () => {
		const ctx = displayContext();
		const query = db.select("doc").return((doc) => ({
			distance: vector.distanceMinkowski(doc.embedding, [0, 0, 0], db.value(3)),
		}));
		const sql = query[__display](ctx);

		expect(sql).toContain("vector::distance::minkowski(");
		expect(Object.values(ctx.variables)).toContainEqual([0, 0, 0]);
	});

	test("two plain arrays with no field or other workable are rejected by the type checker", () => {
		// Never called: this only has to type-check. With no workable argument
		// there is no query context to bind, so `db.value([...])` is still
		// required in that case.
		const neverCalled = () =>
			// @ts-expect-error both operands are literals, so there is no context
			vector.dot([1, 2, 3], [4, 5, 6]);
		expect(typeof neverCalled).toBe("function");
	});
});
