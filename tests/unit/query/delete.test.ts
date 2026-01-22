import { describe, expect, test } from "bun:test";
import Surreal from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

describe("DELETE queries", () => {
	const user = table("user", {
		name: t.string(),
		age: t.number(),
	});

	const db = orm(new Surreal(), user);

	test("generates bulk DELETE", () => {
		const query = db.delete("user");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("DELETE");
	});

	test("generates DELETE with WHERE", () => {
		const query = db.delete("user").where(($this) => $this.age.gt(100));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("DELETE");
		expect(result).toContain("WHERE");
	});

	test("generates DELETE with specific ID", () => {
		const query = db.delete("user", "alice");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("DELETE");
		// ID is in variables, not in the query string directly
	});

	test("generates DELETE with RETURN before", () => {
		const query = db.delete("user", "alice").return("before");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("DELETE");
		expect(result).toContain("RETURN BEFORE");
	});

	test("generates DELETE with RETURN callback", () => {
		const query = db.delete("user", "alice").return((record) => record.name);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("DELETE");
		expect(result).toContain("RETURN");
	});

	test("generates DELETE with TIMEOUT", () => {
		const query = db.delete("user", "alice").timeout("5s");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("DELETE");
		expect(result).toContain("TIMEOUT");
	});

	test("generates bulk DELETE with WHERE and RETURN", () => {
		const query = db
			.delete("user")
			.where(($this) => $this.age.lt(18))
			.return("before");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("DELETE");
		expect(result).toContain("WHERE");
		expect(result).toContain("RETURN BEFORE");
	});
});
