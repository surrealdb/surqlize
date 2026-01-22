import { describe, expect, test } from "bun:test";
import Surreal from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

describe("String functions", () => {
	const user = table("user", {
		name: t.object({
			first: t.string(),
			last: t.string(),
		}),
		email: t.string(),
	});

	const db = orm(new Surreal(), user);

	test("join() generates string::join function", () => {
		const query = db.select("user").return((user) => ({
			fullName: user.name.first.join(" ", user.name.last),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::join");
	});

	test("startsWith() generates string::starts_with function", () => {
		const query = db
			.select("user")
			.where(($this) => $this.email.startsWith("admin"));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::starts_with");
	});

	test("endsWith() generates string::ends_with function", () => {
		const query = db
			.select("user")
			.where(($this) => $this.email.endsWith("@example.com"));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::ends_with");
	});

	test("len() generates string::len function", () => {
		const query = db.select("user").return((user) => ({
			nameLength: user.email.len(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::len");
	});

	test("join() with multiple strings", () => {
		const query = db.select("user").return((user) => ({
			fullInfo: user.name.first.join(" ", user.name.last, user.email),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::join");
	});
});
