import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
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

	test("capitalize() generates string::capitalize function", () => {
		const query = db.select("user").return((user) => ({
			capitalized: user.email.capitalize(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::capitalize");
	});

	test("lowercase() generates string::lowercase function", () => {
		const query = db.select("user").return((user) => ({
			lower: user.email.lowercase(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::lowercase");
	});

	test("uppercase() generates string::uppercase function", () => {
		const query = db.select("user").return((user) => ({
			upper: user.email.uppercase(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::uppercase");
	});

	test("trim() generates string::trim function", () => {
		const query = db.select("user").return((user) => ({
			trimmed: user.email.trim(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::trim");
	});

	test("contains() generates string::contains function", () => {
		const query = db.select("user").return((user) => ({
			hasTest: user.email.contains("test"),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::contains");
	});

	test("replace() generates string::replace function", () => {
		const query = db.select("user").return((user) => ({
			replaced: user.email.replace("a", "b"),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::replace");
	});

	test("reverse() generates string::reverse function", () => {
		const query = db.select("user").return((user) => ({
			reversed: user.email.reverse(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::reverse");
	});

	test("split() generates string::split function", () => {
		const query = db.select("user").return((user) => ({
			parts: user.email.split(","),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::split");
	});

	test("words() generates string::words function", () => {
		const query = db.select("user").return((user) => ({
			wordList: user.email.words(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::words");
	});

	test("isEmail() generates string::is_email function", () => {
		const query = db.select("user").return((user) => ({
			valid: user.email.isEmail(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("string::is_email");
	});
});
