import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, set_, t, table } from "../../../src";

describe("Set functions", () => {
	const user = table("user", {
		tags: t.array(t.string()),
		roles: t.array(t.string()),
	});

	const db = orm(new Surreal(), user);

	test("set_.difference() generates set::difference", () => {
		const query = db.select("user").return((user) => ({
			diff: set_.difference(user.tags, user.roles),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("set::difference");
	});

	test("set_.intersect() generates set::intersect", () => {
		const query = db.select("user").return((user) => ({
			common: set_.intersect(user.tags, user.roles),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("set::intersect");
	});

	test("set_.len() generates set::len", () => {
		const query = db.select("user").return((user) => ({
			size: set_.len(user.tags),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("set::len");
	});

	test("set_.union() generates set::union", () => {
		const query = db.select("user").return((user) => ({
			all: set_.union(user.tags, user.roles),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("set::union");
	});
});
