import { describe, expect, test } from "bun:test";
import {
	BoundIncluded,
	Decimal,
	Duration,
	GeometryPoint,
	Range,
} from "surrealdb";
import { t } from "../../../src";

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
	test("rejects arrays containing duplicates", () => {
		const type = t.set(t.string());
		expect(type.validate(["a", "b"])).toBe(true);
		expect(type.validate(["a", "a"])).toBe(false);
	});

	test("still validates element types", () => {
		const type = t.set(t.string());
		expect(type.validate(["a", 1])).toBe(false);
	});

	test("keeps name 'array' so array functions still resolve", () => {
		expect(t.set(t.string()).name).toBe("array");
	});
});
