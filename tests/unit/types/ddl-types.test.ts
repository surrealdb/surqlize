import { describe, expect, test } from "bun:test";
import {
	BoundIncluded,
	Decimal,
	Duration,
	GeometryPoint,
	Range,
} from "surrealdb";
import { ArrayType, t } from "../../../src";
import { TypeParseError } from "../../../src/error";

describe("Numeric widths", () => {
	test("int() rejects fractional values", () => {
		const type = t.int();
		expect(type.validate(42)).toBe(true);
		expect(type.validate(-7)).toBe(true);
		expect(type.validate(1.5)).toBe(false);
		expect(type.validate("42")).toBe(false);
	});

	test("float() accepts any number", () => {
		const type = t.float();
		expect(type.validate(1.5)).toBe(true);
		expect(type.validate(42)).toBe(true);
	});

	test("decimal() accepts Decimal and number without converting", () => {
		const type = t.decimal();
		const value = new Decimal("1.10");
		expect(type.validate(value)).toBe(true);
		expect(type.validate(42)).toBe(true);
		// Precision must survive: parse returns the Decimal untouched
		expect(type.parse(value)).toBe(value);
	});

	test("all three keep name 'number' so number functions still resolve", () => {
		// getFunctions() dispatches on `name`; renaming these would strip
		// .add()/.gte()/etc from int, float and decimal fields.
		expect(t.int().name).toBe("number");
		expect(t.float().name).toBe("number");
		expect(t.decimal().name).toBe("number");
	});
});

describe("duration()", () => {
	test("validates Duration values", () => {
		const type = t.duration();
		expect(type.validate(new Duration("1h"))).toBe(true);
		expect(type.validate(3600)).toBe(false);
		expect(type.name).toBe("duration");
	});
});

describe("bytes()", () => {
	test("validates Uint8Array values", () => {
		const type = t.bytes();
		expect(type.validate(new Uint8Array([1, 2, 3]))).toBe(true);
		expect(type.validate("abc")).toBe(false);
		expect(type.name).toBe("bytes");
	});

	test("parse accepts the ArrayBuffer the SDK returns", () => {
		const buffer = new Uint8Array([1, 2, 3]).buffer;
		const out = t.bytes().parse(buffer);
		expect(out).toBeInstanceOf(Uint8Array);
		expect([...out]).toEqual([1, 2, 3]);
		// A view over the same memory, not a copy.
		expect(out.buffer).toBe(buffer);
	});

	test("parse returns a Uint8Array unchanged", () => {
		const bytes = new Uint8Array([1, 2, 3]);
		expect(t.bytes().parse(bytes)).toBe(bytes);
	});

	test("parse accepts an empty ArrayBuffer", () => {
		expect(t.bytes().parse(new ArrayBuffer(0)).byteLength).toBe(0);
	});

	test("parse still rejects other values", () => {
		expect(() => t.bytes().parse("abc")).toThrow(TypeParseError);
		expect(() => t.bytes().parse([1, 2])).toThrow(TypeParseError);
		expect(() => t.bytes().parse(undefined)).toThrow(TypeParseError);
	});

	test("validate stays strict, since it also checks what a write carries", () => {
		expect(t.bytes().validate(new ArrayBuffer(1))).toBe(false);
	});

	test("parse reaches bytes inside an option, an array and an object", () => {
		const buffer = () => new Uint8Array([5]).buffer;
		const nested = t.object({
			one: t.option(t.bytes()),
			many: t.array(t.bytes()),
		});
		const out = nested.parse({ one: buffer(), many: [buffer(), buffer()] });
		expect(out.one).toBeInstanceOf(Uint8Array);
		expect(out.many.every((b) => b instanceof Uint8Array)).toBe(true);
	});
});

describe("any()", () => {
	test("accepts every value", () => {
		const type = t.any();
		expect(type.validate("x")).toBe(true);
		expect(type.validate(0)).toBe(true);
		expect(type.validate(null)).toBe(true);
		expect(type.validate(undefined)).toBe(true);
	});
});

describe("geometry()", () => {
	test("validates Geometry values and records its kind", () => {
		const type = t.geometry("point");
		expect(type.kind).toBe("point");
		expect(type.validate(new GeometryPoint([1, 2]))).toBe(true);
		expect(type.validate({ type: "Point" })).toBe(false);
	});

	test("is unconstrained when no kind is given", () => {
		expect(t.geometry().kind).toBeUndefined();
	});
});

describe("range()", () => {
	test("validates Range values", () => {
		const type = t.range();
		const range = new Range(new BoundIncluded(1), new BoundIncluded(10));
		expect(type.validate(range)).toBe(true);
		expect(type.validate([1, 10])).toBe(false);
	});
});

describe("set()", () => {
	test("accepts a Set, including an empty one", () => {
		const type = t.set(t.string());
		expect(type.validate(new Set(["a", "b"]))).toBe(true);
		expect(type.validate(new Set())).toBe(true);
	});

	test("rejects arrays and other non-Set values", () => {
		const type = t.set(t.string());
		expect(type.validate(["a", "b"])).toBe(false);
		expect(type.validate([])).toBe(false);
		expect(type.validate("a")).toBe(false);
		expect(type.validate(null)).toBe(false);
		expect(type.validate(undefined)).toBe(false);
		expect(type.validate({})).toBe(false);
	});

	test("validates member types", () => {
		const type = t.set(t.string());
		expect(type.validate(new Set(["a", 1]))).toBe(false);
		expect(type.validate(new Set([1]))).toBe(false);
	});

	test("enforces the declared maximum size", () => {
		const type = t.set(t.string(), 2);
		expect(type.validate(new Set(["a", "b"]))).toBe(true);
		expect(type.validate(new Set(["a", "b", "c"]))).toBe(false);
	});

	test("parse returns a new Set of parsed members", () => {
		const type = t.set(t.string());
		const input = new Set(["a"]);
		const out = type.parse(input);
		expect(out).toBeInstanceOf(Set);
		expect(out).not.toBe(input);
		expect([...out]).toEqual(["a"]);
		expect(() => type.parse(["a"])).toThrow();
		expect(() => type.parse(new Set([1]))).toThrow();
		expect(() => t.set(t.string(), 1).parse(new Set(["a", "b"]))).toThrow();
	});

	test("is its own type, not an array", () => {
		expect(t.set(t.string()).name).toBe("set");
		expect(t.set(t.string())).not.toBeInstanceOf(ArrayType);
	});
});
