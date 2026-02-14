import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, object, orm, t, table } from "../../../src";

describe("Object functions", () => {
	const user = table("user", {
		name: t.string(),
		metadata: t.object({
			bio: t.string(),
			avatar: t.string(),
		}),
	});

	const db = orm(new Surreal(), user);

	test("object.entries() generates object::entries", () => {
		const query = db.select("user").return((user) => ({
			entries: object.entries(user.metadata),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("object::entries");
	});

	test("object.fromEntries() generates object::from_entries", () => {
		const query = db.select("user").return((user) => ({
			obj: object.fromEntries(user.metadata),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("object::from_entries");
	});

	test("object.keys() generates object::keys", () => {
		const query = db.select("user").return((user) => ({
			keys: object.keys(user.metadata),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("object::keys");
	});

	test("object.len() generates object::len", () => {
		const query = db.select("user").return((user) => ({
			size: object.len(user.metadata),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("object::len");
	});

	test("object.values() generates object::values", () => {
		const query = db.select("user").return((user) => ({
			vals: object.values(user.metadata),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("object::values");
	});
});
