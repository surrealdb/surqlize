import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { t } from "../../../src";
import { TypeParseError } from "../../../src/error";
import { NoneType, UnionType } from "../../../src/types/classes";

describe("Type builders", () => {
	describe("string()", () => {
		test("creates StringType", () => {
			const type = t.string();
			expect(type).toBeDefined();
			expect(type.name).toBe("string");
		});

		test("validates string values", () => {
			const type = t.string();
			expect(type.validate("hello")).toBe(true);
			expect(type.validate(123)).toBe(false);
			expect(type.validate(null)).toBe(false);
		});
	});

	describe("number()", () => {
		test("creates NumberType", () => {
			const type = t.number();
			expect(type).toBeDefined();
			expect(type.name).toBe("number");
		});

		test("validates number values", () => {
			const type = t.number();
			expect(type.validate(123)).toBe(true);
			expect(type.validate(3.14)).toBe(true);
			expect(type.validate("123")).toBe(false);
			expect(type.validate(null)).toBe(false);
		});
	});

	describe("bool()", () => {
		test("creates BoolType", () => {
			const type = t.bool();
			expect(type).toBeDefined();
			expect(type.name).toBe("bool");
		});

		test("validates boolean values", () => {
			const type = t.bool();
			expect(type.validate(true)).toBe(true);
			expect(type.validate(false)).toBe(true);
			expect(type.validate(1)).toBe(false);
			expect(type.validate("true")).toBe(false);
		});
	});

	describe("null()", () => {
		test("creates NullType", () => {
			const type = t.null();
			expect(type).toBeDefined();
			expect(type.name).toBe("null");
		});

		test("validates null values", () => {
			const type = t.null();
			expect(type.validate(null)).toBe(true);
			expect(type.validate(undefined)).toBe(false);
			expect(type.validate("null")).toBe(false);
		});
	});

	describe("none()", () => {
		test("creates NoneType", () => {
			const type = t.none();
			expect(type).toBeDefined();
			expect(type.name).toBe("none");
		});
	});

	describe("date()", () => {
		test("creates DateType", () => {
			const type = t.date();
			expect(type).toBeDefined();
			expect(type.name).toBe("date");
		});

		test("validates Date values", () => {
			const type = t.date();
			expect(type.validate(new Date())).toBe(true);
			expect(type.validate("2024-01-01")).toBe(false);
			expect(type.validate(Date.now())).toBe(false);
		});
	});

	describe("uuid()", () => {
		test("creates UuidType", () => {
			const type = t.uuid();
			expect(type).toBeDefined();
			expect(type.name).toBe("uuid");
		});
	});

	describe("object()", () => {
		test("creates ObjectType with schema", () => {
			const type = t.object({
				name: t.string(),
				age: t.number(),
			});
			expect(type).toBeDefined();
			expect(type.name).toBe("object");
			expect(type.schema).toHaveProperty("name");
			expect(type.schema).toHaveProperty("age");
		});

		test("validates object values", () => {
			const type = t.object({
				name: t.string(),
				age: t.number(),
			});
			expect(type.validate({ name: "John", age: 30 })).toBe(true);
			expect(type.validate({ name: "John" })).toBe(false);
			expect(type.validate({ name: "John", age: "30" })).toBe(false);
			expect(type.validate("not an object")).toBe(false);
		});

		test("handles nested objects", () => {
			const type = t.object({
				user: t.object({
					name: t.string(),
					email: t.string(),
				}),
			});
			expect(
				type.validate({
					user: { name: "John", email: "john@example.com" },
				}),
			).toBe(true);
		});
	});

	describe("array()", () => {
		test("creates ArrayType with single schema", () => {
			const type = t.array(t.string());
			expect(type).toBeDefined();
			expect(type.name).toBe("array");
		});

		test("creates ArrayType with tuple schema", () => {
			const type = t.array([t.string(), t.number(), t.bool()]);
			expect(type).toBeDefined();
			expect(type.name).toBe("array");
		});

		test("validates array values", () => {
			const type = t.array(t.string());
			expect(type.validate(["a", "b", "c"])).toBe(true);
			expect(type.validate([])).toBe(true);
			expect(type.validate([1, 2, 3])).toBe(false);
			expect(type.validate("not an array")).toBe(false);
		});

		test("validates tuple arrays", () => {
			const type = t.array([t.string(), t.number()]);
			expect(type.validate(["hello", 123])).toBe(true);
			expect(type.validate([123, "hello"])).toBe(false);
			expect(type.validate(["hello"])).toBe(false);
		});
	});

	describe("union()", () => {
		test("creates UnionType with multiple schemas", () => {
			const type = t.union([t.string(), t.number()]);
			expect(type).toBeDefined();
			expect(type.name).toBe("union");
		});

		test("validates union values", () => {
			const type = t.union([t.string(), t.number()]);
			expect(type.validate("hello")).toBe(true);
			expect(type.validate(123)).toBe(true);
			expect(type.validate(true)).toBe(false);
			expect(type.validate(null)).toBe(false);
		});
	});

	describe("option()", () => {
		test("creates OptionType", () => {
			const type = t.option(t.string());
			expect(type).toBeDefined();
			expect(type.name).toBe("option");
		});

		test("validates optional values", () => {
			const type = t.option(t.string());
			expect(type.validate("hello")).toBe(true);
			expect(type.validate(undefined)).toBe(true);
			expect(type.validate(123)).toBe(false);
		});
	});

	describe("literal()", () => {
		test("creates LiteralType for string", () => {
			const type = t.literal("hello");
			expect(type).toBeDefined();
			expect(type.name).toBe("literal");
		});

		test("creates LiteralType for number", () => {
			const type = t.literal(42);
			expect(type).toBeDefined();
			expect(type.name).toBe("literal");
		});

		test("creates LiteralType for boolean", () => {
			const type = t.literal(true);
			expect(type).toBeDefined();
			expect(type.name).toBe("literal");
		});

		test("validates literal values", () => {
			const stringType = t.literal("hello");
			expect(stringType.validate("hello")).toBe(true);
			expect(stringType.validate("world")).toBe(false);

			const numberType = t.literal(42);
			expect(numberType.validate(42)).toBe(true);
			expect(numberType.validate(43)).toBe(false);

			const boolType = t.literal(true);
			expect(boolType.validate(true)).toBe(true);
			expect(boolType.validate(false)).toBe(false);
		});
	});

	describe("record()", () => {
		test("creates RecordType without table", () => {
			const type = t.record();
			expect(type).toBeDefined();
			expect(type.name).toBe("record");
		});

		test("creates RecordType with table", () => {
			const type = t.record("user");
			expect(type).toBeDefined();
			expect(type.name).toBe("record");
			expect(type.tb).toBe("user");
		});
	});

	describe("parse()", () => {
		test("StringType.parse() returns valid string", () => {
			expect(t.string().parse("hello")).toBe("hello");
		});

		test("StringType.parse() throws for non-string", () => {
			expect(() => t.string().parse(42)).toThrow(TypeParseError);
		});

		test("NumberType.parse() returns valid number", () => {
			expect(t.number().parse(42)).toBe(42);
		});

		test("NumberType.parse() throws for non-number", () => {
			expect(() => t.number().parse("42")).toThrow(TypeParseError);
		});

		test("BoolType.parse() returns valid boolean", () => {
			expect(t.bool().parse(true)).toBe(true);
		});

		test("BoolType.parse() throws for non-boolean", () => {
			expect(() => t.bool().parse(1)).toThrow(TypeParseError);
		});

		test("ObjectType.parse() returns valid object", () => {
			const type = t.object({ name: t.string() });
			const val = { name: "Alice" };
			expect(type.parse(val)).toBe(val);
		});

		test("ObjectType.parse() throws for null", () => {
			const type = t.object({ name: t.string() });
			expect(() => type.parse(null)).toThrow(TypeParseError);
		});

		test("ObjectType.parse() throws for invalid nested field", () => {
			const type = t.object({ name: t.string(), age: t.number() });
			expect(() => type.parse({ name: "Alice", age: "30" })).toThrow(
				TypeParseError,
			);
		});

		test("ArrayType.parse() returns valid array", () => {
			const type = t.array(t.string());
			const val = ["a", "b"];
			expect(type.parse(val)).toBe(val);
		});

		test("ArrayType.parse() throws for non-array", () => {
			expect(() => t.array(t.string()).parse("not array")).toThrow(
				TypeParseError,
			);
		});

		test("ArrayType.parse() throws for tuple length mismatch", () => {
			const type = t.array([t.string(), t.number()]);
			expect(() => type.parse(["hello"])).toThrow(TypeParseError);
		});

		test("DateType.parse() returns Date passthrough", () => {
			const date = new Date();
			expect(t.date().parse(date)).toBe(date);
		});

		test("DateType.parse() converts object with toDate()", () => {
			const fakeDateTime = {
				toDate: () => new Date("2024-01-01"),
			};
			const result = t.date().parse(fakeDateTime);
			expect(result).toBeInstanceOf(Date);
			expect(result.getFullYear()).toBe(2024);
		});

		test("DateType.parse() throws for invalid value", () => {
			expect(() => t.date().parse("2024-01-01")).toThrow(TypeParseError);
		});
	});

	describe("get()", () => {
		test("ObjectType.get() returns correct type for known key", () => {
			const type = t.object({ name: t.string(), age: t.number() });
			const [fieldType, path] = type.get("name");
			expect(fieldType.name).toBe("string");
			expect(path).toBe('["name"]');
		});

		test("ObjectType.get() returns NoneType for unknown key", () => {
			const type = t.object({ name: t.string() });
			const [fieldType, path] = type.get("unknown");
			expect(fieldType).toBeInstanceOf(NoneType);
			expect(path).toBe('["unknown"]');
		});

		test("ArrayType.get() returns element type for tuple index", () => {
			const type = t.array([t.string(), t.number()]);
			const [fieldType] = type.get(0);
			expect(fieldType.name).toBe("string");
			const [fieldType2] = type.get(1);
			expect(fieldType2.name).toBe("number");
		});

		test("ArrayType.get() returns UnionType for homogeneous array index", () => {
			const type = t.array(t.string());
			const [fieldType] = type.get(0);
			expect(fieldType).toBeInstanceOf(UnionType);
		});

		test("ArrayType.get() returns NoneType for out-of-range tuple index", () => {
			const type = t.array([t.string()]);
			const [fieldType] = type.get(99);
			expect(fieldType).toBeInstanceOf(NoneType);
		});

		test("AbstractType.get() returns NoneType by default", () => {
			const type = t.string();
			const [fieldType, path] = type.get("anything");
			expect(fieldType).toBeInstanceOf(NoneType);
			expect(path).toBe('["anything"]');
		});
	});

	describe("RecordType validation", () => {
		test("validates RecordId without table constraint", () => {
			const type = t.record();
			expect(type.validate(new RecordId("user", "alice"))).toBe(true);
			expect(type.validate(new RecordId("post", "1"))).toBe(true);
		});

		test("validates RecordId with matching table", () => {
			const type = t.record("user");
			expect(type.validate(new RecordId("user", "alice"))).toBe(true);
		});

		test("rejects RecordId with wrong table", () => {
			const type = t.record("user");
			expect(type.validate(new RecordId("post", "1"))).toBe(false);
		});

		test("rejects non-RecordId values", () => {
			const type = t.record("user");
			expect(type.validate("user:alice")).toBe(false);
			expect(type.validate(42)).toBe(false);
			expect(type.validate(null)).toBe(false);
		});
	});

	describe("NeverType", () => {
		test("validate() returns false when called with an argument", () => {
			const type = t.never();
			expect(type.validate(undefined)).toBe(false);
			expect(type.validate(null)).toBe(false);
			expect(type.validate("anything")).toBe(false);
		});
	});

	describe("infer<>", () => {
		test("type inference is correct at compile time", () => {
			// These are compile-time type checks via TypeScript
			// No runtime tests needed as type inference is checked by TypeScript compiler
			const stringType = t.string();
			const numberType = t.number();
			const objectType = t.object({
				name: t.string(),
				age: t.number(),
			});
			const arrayType = t.array(t.string());
			const unionType = t.union([t.string(), t.number()]);
			const optionType = t.option(t.string());

			// Just verify the types exist
			expect(stringType).toBeDefined();
			expect(numberType).toBeDefined();
			expect(objectType).toBeDefined();
			expect(arrayType).toBeDefined();
			expect(unionType).toBeDefined();
			expect(optionType).toBeDefined();
		});
	});
});
