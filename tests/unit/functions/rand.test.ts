import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, rand, t, table } from "../../../src";

describe("Rand functions", () => {
	const user = table("user", {
		age: t.number(),
		email: t.string(),
		created: t.date(),
	});

	const db = orm(new Surreal(), user);

	test("rand.uuid() generates rand::uuid", () => {
		const query = db.select("user").return((user) => ({
			id: rand.uuid(user),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("rand::uuid");
	});

	test("rand.bool() generates rand::bool", () => {
		const query = db.select("user").return((user) => ({
			flag: rand.bool(user),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("rand::bool");
	});
});
