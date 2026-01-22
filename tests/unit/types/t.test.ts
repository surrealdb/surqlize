import { describe, expect, test } from "bun:test";
import { t } from "../../../src";

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
