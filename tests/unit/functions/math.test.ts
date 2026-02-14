import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, math, orm, t, table } from "../../../src";

describe("Math standalone functions", () => {
	const user = table("user", {
		age: t.number(),
		email: t.string(),
		created: t.date(),
	});

	const db = orm(new Surreal(), user);

	test("math.sum() generates math::sum", () => {
		const query = db.select("user").return((user) => ({
			total: math.sum(user.age),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::sum");
	});

	test("math.mean() generates math::mean", () => {
		const query = db.select("user").return((user) => ({
			avg: math.mean(user.age),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::mean");
	});

	test("math.pi() generates math::pi", () => {
		const query = db.select("user").return((user) => ({
			pi: math.pi(user),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::pi");
	});

	test("math.e() generates math::e", () => {
		const query = db.select("user").return((user) => ({
			e: math.e(user),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::e");
	});
});
