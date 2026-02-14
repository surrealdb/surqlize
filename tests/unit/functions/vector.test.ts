import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table, vector } from "../../../src";

describe("Vector functions", () => {
	const user = table("user", {
		age: t.number(),
		email: t.string(),
		created: t.date(),
	});

	const db = orm(new Surreal(), user);

	test("vector.dot() generates vector::dot", () => {
		const query = db.select("user").return((user) => ({
			dotProduct: vector.dot(user, user.age, user.age),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("vector::dot");
	});
});
