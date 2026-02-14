import { describe, expect, test } from "bun:test";
import { t } from "../../src";
import { TypeParseError } from "../../src/error";

describe("TypeParseError", () => {
	test("stores name, expected, and found properties", () => {
		const err = new TypeParseError("string", "string", 42);
		expect(err.name).toBe("string");
		expect(err.expected).toBe("string");
		expect(err.found).toBe(42);
	});

	test("formats message with single expected string", () => {
		const err = new TypeParseError("string", "string", 42);
		expect(err.message).toBe("Expected string but found 42");
	});

	test("formats message with 2-item expected array", () => {
		const err = new TypeParseError("union", ["string", "number"], true);
		expect(err.message).toBe("Expected string or number but found true");
	});

	test("formats message with 3+ item expected array", () => {
		const err = new TypeParseError(
			"union",
			["string", "number", "boolean"],
			null,
		);
		expect(err.message).toBe(
			"Expected string, number or boolean but found null",
		);
	});

	test("formats message with 1-item expected array", () => {
		const err = new TypeParseError(
			"literal",
			["hello"] as unknown as [string, string],
			"world",
		);
		expect(err.message).toBe("Expected hello but found world");
	});

	test("is an instance of Error", () => {
		const err = new TypeParseError("string", "string", 42);
		expect(err).toBeInstanceOf(Error);
	});

	describe("thrown by parse()", () => {
		test("StringType.parse() throws TypeParseError for invalid value", () => {
			const type = t.string();
			try {
				type.parse(42);
				expect(true).toBe(false); // should not reach
			} catch (err) {
				expect(err).toBeInstanceOf(TypeParseError);
				const parseErr = err as TypeParseError;
				expect(parseErr.name).toBe("string");
				expect(parseErr.expected).toBe("string");
				expect(parseErr.found).toBe(42);
			}
		});

		test("NumberType.parse() throws TypeParseError for invalid value", () => {
			const type = t.number();
			try {
				type.parse("hello");
				expect(true).toBe(false);
			} catch (err) {
				expect(err).toBeInstanceOf(TypeParseError);
				const parseErr = err as TypeParseError;
				expect(parseErr.name).toBe("number");
				expect(parseErr.found).toBe("hello");
			}
		});

		test("ObjectType.parse() throws TypeParseError for null", () => {
			const type = t.object({ name: t.string() });
			try {
				type.parse(null);
				expect(true).toBe(false);
			} catch (err) {
				expect(err).toBeInstanceOf(TypeParseError);
			}
		});

		test("ArrayType.parse() throws TypeParseError for non-array", () => {
			const type = t.array(t.string());
			try {
				type.parse("not an array");
				expect(true).toBe(false);
			} catch (err) {
				expect(err).toBeInstanceOf(TypeParseError);
			}
		});

		test("parse() returns valid value unchanged", () => {
			expect(t.string().parse("hello")).toBe("hello");
			expect(t.number().parse(42)).toBe(42);
			expect(t.bool().parse(true)).toBe(true);
		});
	});
});
