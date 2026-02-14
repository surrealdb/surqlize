import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, not_, orm, t, table } from "../../../src";

describe("Not function", () => {
	const user = table("user", {
		age: t.number(),
		email: t.string(),
		created: t.date(),
	});

	const db = orm(new Surreal(), user);

	test("not_() generates not(", () => {
		const query = db.select("user").return((user) => ({
			negated: not_(user.age),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("not(");
	});
});
