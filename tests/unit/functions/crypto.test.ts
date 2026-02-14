import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { crypto, __display, displayContext, orm, t, table } from "../../../src";

describe("Crypto functions", () => {
	const user = table("user", {
		age: t.number(),
		email: t.string(),
		created: t.date(),
	});

	const db = orm(new Surreal(), user);

	test("crypto.md5() generates crypto::md5", () => {
		const query = db.select("user").return((user) => ({
			hash: crypto.md5(user, user.email),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("crypto::md5");
	});

	test("crypto.sha256() generates crypto::sha256", () => {
		const query = db.select("user").return((user) => ({
			hash: crypto.sha256(user, user.email),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("crypto::sha256");
	});
});
