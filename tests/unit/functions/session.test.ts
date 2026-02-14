import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import {
	__display,
	displayContext,
	orm,
	session,
	t,
	table,
} from "../../../src";

describe("Session functions", () => {
	const user = table("user", {
		age: t.number(),
		email: t.string(),
		created: t.date(),
	});

	const db = orm(new Surreal(), user);

	test("session.db() generates session::db", () => {
		const query = db.select("user").return((user) => ({
			database: session.db(user),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("session::db");
	});
});
