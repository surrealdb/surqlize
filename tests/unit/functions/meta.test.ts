import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, meta, orm, t, table } from "../../../src";

describe("Meta functions", () => {
	const user = table("user", {
		name: t.string(),
		ref: t.record("user"),
	});

	const db = orm(new Surreal(), user);

	test("meta.id() generates meta::id", () => {
		const query = db.select("user").return((user) => ({
			rid: meta.id(user.ref),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("meta::id");
	});

	test("meta.table() generates meta::table", () => {
		const query = db.select("user").return((user) => ({
			tb: meta.table(user.ref),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("meta::table");
	});

	test("meta.tb() generates meta::tb", () => {
		const query = db.select("user").return((user) => ({
			tb: meta.tb(user.ref),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("meta::tb");
	});
});
