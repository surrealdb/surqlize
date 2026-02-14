import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, parse, t, table } from "../../../src";

describe("Parse functions", () => {
	const user = table("user", {
		age: t.number(),
		email: t.string(),
		created: t.date(),
	});

	const db = orm(new Surreal(), user);

	test("parse.emailHost() generates parse::email::host", () => {
		const query = db.select("user").return((user) => ({
			host: parse.emailHost(user.email),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("parse::email::host");
	});
});
