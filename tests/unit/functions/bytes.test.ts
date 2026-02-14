import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, bytes, displayContext, orm, t, table } from "../../../src";

describe("Bytes functions", () => {
	const user = table("user", {
		age: t.number(),
		email: t.string(),
		created: t.date(),
	});

	const db = orm(new Surreal(), user);

	test("bytes.len() generates bytes::len", () => {
		const query = db.select("user").return((user) => ({
			size: bytes.len(user.email),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("bytes::len");
	});
});
