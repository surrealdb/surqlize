import { describe, expect, test } from "bun:test";
import { simplifyCondition } from "../../../src/schema/ddl/condition";

describe("simplifyCondition", () => {
	test("leaves a plain condition alone", () => {
		expect(simplifyCondition("a = 1")).toBe("a = 1");
		expect(simplifyCondition("a = 1 AND b = 2")).toBe("a = 1 AND b = 2");
	});

	test("drops parentheses around the whole condition", () => {
		expect(simplifyCondition("((a = 1 AND b = 2))")).toBe("a = 1 AND b = 2");
	});

	test("an AND group never needs parentheses", () => {
		expect(simplifyCondition("a = 1 OR (b = 2 AND c = 3)")).toBe(
			"a = 1 OR b = 2 AND c = 3",
		);
		expect(simplifyCondition("a = 1 AND (b = 2 AND c = 3)")).toBe(
			"a = 1 AND b = 2 AND c = 3",
		);
	});

	test("an OR group needs them inside an AND, and not inside an OR", () => {
		expect(simplifyCondition("a = 1 AND (b = 2 OR c = 3)")).toBe(
			"a = 1 AND (b = 2 OR c = 3)",
		);
		expect(simplifyCondition("a = 1 OR (b = 2 OR c = 3)")).toBe(
			"a = 1 OR b = 2 OR c = 3",
		);
	});

	test("works from the inside out", () => {
		expect(simplifyCondition("(a = 1 OR (b = 2 AND (c = 3 OR d = 4)))")).toBe(
			"a = 1 OR b = 2 AND (c = 3 OR d = 4)",
		);
	});

	test("never touches a call's parentheses or a prefix's", () => {
		expect(simplifyCondition("string::len(a) > 1 AND (b = 2 OR c = 3)")).toBe(
			"string::len(a) > 1 AND (b = 2 OR c = 3)",
		);
		expect(simplifyCondition("!(a = 1 AND b = 2)")).toBe("!(a = 1 AND b = 2)");
		expect(simplifyCondition("a = (user:alice)")).toBe("a = (user:alice)");
	});

	test("a call wrapping a group does not double its parentheses", () => {
		expect(simplifyCondition("not((a = 1 OR b = 2))")).toBe(
			"not(a = 1 OR b = 2)",
		);
	});

	test("AND and OR inside a string are text", () => {
		expect(simplifyCondition('a = "x AND (y" OR (b = 1 AND c = 2)')).toBe(
			'a = "x AND (y" OR b = 1 AND c = 2',
		);
	});
});
