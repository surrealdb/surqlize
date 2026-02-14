import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table, value } from "../../../src";

describe("Value functions", () => {
	const user = table("user", {
		name: t.string(),
		data: t.string(),
	});

	const db = orm(new Surreal(), user);

	test("value.diff() generates value::diff", () => {
		const query = db.select("user").return((user) => ({
			changes: value.diff(user.name, user.data),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("value::diff");
	});

	test("value.patch() generates value::patch", () => {
		const query = db.select("user").return((user) => ({
			patched: value.patch(user.name, user.data),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("value::patch");
	});
});
