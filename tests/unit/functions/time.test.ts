import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import {
	__display,
	displayContext,
	orm,
	t,
	table,
	time as timeFn,
} from "../../../src";

describe("Time standalone functions", () => {
	const user = table("user", {
		age: t.number(),
		email: t.string(),
		created: t.date(),
	});

	const db = orm(new Surreal(), user);

	test("time.now() generates time::now", () => {
		const query = db.select("user").return((user) => ({
			now: timeFn.now(user),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::now");
	});
});
