import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import {
	__display,
	displayContext,
	encoding,
	orm,
	t,
	table,
} from "../../../src";

describe("Encoding functions", () => {
	const user = table("user", {
		age: t.number(),
		email: t.string(),
		created: t.date(),
	});

	const db = orm(new Surreal(), user);

	test("encoding.base64Encode() generates encoding::base64::encode", () => {
		const query = db.select("user").return((user) => ({
			encoded: encoding.base64Encode(user, user.email),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("encoding::base64::encode");
	});
});
