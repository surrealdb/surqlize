import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, count, displayContext, orm, t, table } from "../../../src";

describe("Count functions", () => {
	const user = table("user", {
		age: t.number(),
		email: t.string(),
		created: t.date(),
	});

	const db = orm(new Surreal(), user);

	test("count() generates count()", () => {
		const query = db.select("user").return((user) => ({
			total: count.count(user),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("count()");
	});

	test("count(value) generates count(", () => {
		const query = db.select("user").return((user) => ({
			total: count.count(user, user.age),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("count(");
	});
});
