import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import {
	__display,
	displayContext,
	orm,
	t,
	table,
	type_ as typeFn,
} from "../../../src";

describe("Type functions", () => {
	const user = table("user", {
		age: t.number(),
		email: t.string(),
		created: t.date(),
	});

	const db = orm(new Surreal(), user);

	test("type.isString() generates type::is_string", () => {
		const query = db.select("user").return((user) => ({
			check: typeFn.isString(user.email),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("type::is_string");
	});

	test("type.of() generates type::of", () => {
		const query = db.select("user").return((user) => ({
			typeOf: typeFn.of(user.email),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("type::of");
	});
});
