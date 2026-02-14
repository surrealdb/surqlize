import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, sleep, t, table } from "../../../src";

describe("Sleep function", () => {
	const user = table("user", {
		delay: t.string(),
	});

	const db = orm(new Surreal(), user);

	test("sleep() generates sleep", () => {
		const query = db.select("user").return((user) => ({
			result: sleep(user.delay),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("sleep(");
	});
});
