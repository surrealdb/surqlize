import { describe, expect, test } from "bun:test";
import { t } from "../../../src";
import { printSurqlType } from "../../../src/schema/ddl/print-type";

describe("printSurqlType", () => {
	test("renders scalars", () => {
		expect(printSurqlType(t.string())).toBe("string");
		expect(printSurqlType(t.bool())).toBe("bool");
		expect(printSurqlType(t.date())).toBe("datetime");
		expect(printSurqlType(t.uuid())).toBe("uuid");
		expect(printSurqlType(t.duration())).toBe("duration");
		expect(printSurqlType(t.bytes())).toBe("bytes");
		expect(printSurqlType(t.any())).toBe("any");
		expect(printSurqlType(t.null())).toBe("null");
		expect(printSurqlType(t.none())).toBe("none");
	});

	test("distinguishes the numeric widths", () => {
		// All four report name "number" so they share the function family; only
		// the class tells them apart, which is exactly what DDL needs.
		expect(printSurqlType(t.number())).toBe("number");
		expect(printSurqlType(t.int())).toBe("int");
		expect(printSurqlType(t.float())).toBe("float");
		expect(printSurqlType(t.decimal())).toBe("decimal");
	});

	test("renders option, array and set", () => {
		expect(printSurqlType(t.option(t.string()))).toBe("option<string>");
		expect(printSurqlType(t.array(t.int()))).toBe("array<int>");
		expect(printSurqlType(t.set(t.string()))).toBe("set<string>");
	});

	test("distinguishes set from array", () => {
		expect(t.set(t.string()).name).not.toBe(t.array(t.string()).name);
		expect(printSurqlType(t.set(t.string()))).not.toBe(
			printSurqlType(t.array(t.string())),
		);
	});

	test("renders record links", () => {
		expect(printSurqlType(t.record("user"))).toBe("record<user>");
		expect(printSurqlType(t.record(["post", "user"]))).toBe(
			"record<post | user>",
		);
		expect(printSurqlType(t.record())).toBe("record");
	});

	test("renders geometry and range", () => {
		expect(printSurqlType(t.geometry("point"))).toBe("geometry<point>");
		expect(printSurqlType(t.geometry())).toBe("geometry");
		// SurrealDB rejects `range<int>`; a bare `range` is the only valid form
		expect(printSurqlType(t.range())).toBe("range");
	});

	test("renders literals and unions", () => {
		expect(printSurqlType(t.literal("active"))).toBe("'active'");
		expect(printSurqlType(t.literal(3))).toBe("3");
		expect(printSurqlType(t.union([t.literal("a"), t.literal("b")]))).toBe(
			"'a' | 'b'",
		);
	});

	test("prints a tuple as a tuple, so the database holds its length and positions", () => {
		expect(printSurqlType(t.array([t.string(), t.int()]))).toBe(
			"[string, int]",
		);
		// Two positions of one type are still two positions
		expect(printSurqlType(t.array([t.string(), t.string()]))).toBe(
			"[string, string]",
		);
	});

	test("an object in a union or tuple is written out; elsewhere it is `object`", () => {
		expect(printSurqlType(t.object({ a: t.string() }))).toBe("object");
		expect(printSurqlType(t.array(t.object({ a: t.string() })))).toBe(
			"array<object>",
		);
		expect(
			printSurqlType(t.union([t.object({ a: t.string() }), t.string()])),
		).toBe("{ a: string } | string");
	});

	test("a string literal is quoted the way the database stores it", () => {
		expect(printSurqlType(t.literal("draft"))).toBe("'draft'");
		expect(printSurqlType(t.literal("it's"))).toBe(`"it's"`);
	});

	test("a point is a geometry<point>, not `any`", () => {
		expect(printSurqlType(t.point())).toBe("geometry<point>");
	});

	test("renders a nested object as `object`", () => {
		// The children are emitted as their own dotted DEFINE FIELD statements.
		expect(printSurqlType(t.object({ street: t.string() }))).toBe("object");
	});

	test("nests arbitrarily deep", () => {
		expect(printSurqlType(t.option(t.array(t.option(t.record("user")))))).toBe(
			"option<array<option<record<user>>>>",
		);
	});

	test("is unaffected by DDL modifiers", () => {
		expect(printSurqlType(t.string().assert("x").readonly())).toBe("string");
		expect(printSurqlType(t.int().default(0))).toBe("int");
	});
});
