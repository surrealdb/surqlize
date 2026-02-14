import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, not, orm, t, table } from "../../../src";

describe("Not function", () => {
	const user = table("user", {
		age: t.number(),
		email: t.string(),
		created: t.date(),
	});

	const db = orm(new Surreal(), user);

	test("not() generates not(", () => {
		const query = db.select("user").return((user) => ({
			negated: not(user.age),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("not(");
	});
});
