import { describe, expect, test } from "bun:test";
import { defineEvent } from "../../../src/schema/ddl/event-ddl";
import { defineIndex } from "../../../src/schema/ddl/index-ddl";
import { fieldPath, ident, quote } from "../../../src/schema/ddl/syntax";

describe("quote", () => {
	test("single-quotes a plain string", () => {
		expect(quote("draft")).toBe("'draft'");
	});

	test("switches to double quotes for an apostrophe, as the database stores it", () => {
		expect(quote("it's")).toBe(`"it's"`);
	});

	test("escapes a backslash, so it cannot end the string early", () => {
		expect(quote("a\\")).toBe("'a\\\\'");
		// A backslash before an apostrophe stays a backslash and an apostrophe
		expect(quote("a\\'b")).toBe(`"a\\\\'b"`);
		expect(quote("\\")).toBe("'\\\\'");
	});

	test("escapes the quote it uses", () => {
		expect(quote('say "hi" and it\'s', '"')).toBe(`"say \\"hi\\" and it's"`);
	});
});

describe("ident and fieldPath", () => {
	test("leave plain names alone, keywords included", () => {
		expect(ident("name")).toBe("name");
		expect(ident("by")).toBe("by");
	});

	test("escape anything else", () => {
		expect(ident("order-item")).toBe("⟨order-item⟩");
		expect(ident("unit price")).toBe("⟨unit price⟩");
	});

	test("escape each name of a path and keep the element wildcards", () => {
		expect(fieldPath("items[*].max width")).toBe("items[*].⟨max width⟩");
		expect(fieldPath("grid[*][*].v")).toBe("grid[*][*].v");
	});

	test("a long run of wildcards is handled in linear time", () => {
		const path = `a${"[*]".repeat(50_000)}.b`;
		const started = performance.now();
		expect(fieldPath(path)).toBe(path);
		expect(performance.now() - started).toBeLessThan(500);
	});
});

describe("comments", () => {
	test("an index comment with a backslash and a quote is escaped", () => {
		const sql = defineIndex("t", {
			name: "i",
			fields: ["a"],
			comment: "it's a\\b",
		});
		expect(sql).toContain(`COMMENT "it's a\\\\b"`);
	});

	test("an event comment with a trailing backslash does not end the string early", () => {
		const sql = defineEvent("t", {
			name: "e",
			on: ["CREATE"],
			body: "RETURN 1",
			comment: "ends with \\",
		});
		expect(sql).toContain("COMMENT 'ends with \\\\'");
	});
});
