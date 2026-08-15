import { describe, expect, test } from "bun:test";
import { t } from "../../../src";
import { printSurqlType } from "../../../src/schema/ddl/print-type";

/**
 * What each field modifier records, and how bounded collections print.
 *
 * The modifiers carry DDL metadata only — none of them changes the inferred
 * TypeScript type, and none mutates the type it was called on.
 */

describe("Collection bounds", () => {
	test("an array takes a maximum length", () => {
		expect(printSurqlType(t.array(t.string(), 10))).toBe("array<string, 10>");
	});

	test("a set takes a maximum length", () => {
		expect(printSurqlType(t.set(t.string(), 5))).toBe("set<string, 5>");
	});

	test("an unbounded collection prints without one", () => {
		expect(printSurqlType(t.array(t.string()))).toBe("array<string>");
		expect(printSurqlType(t.set(t.string()))).toBe("set<string>");
	});

	test("a bound is rejected at parse time, not just declared", () => {
		const capped = t.array(t.string(), 2);

		expect(capped.validate(["a", "b"])).toBe(true);
		expect(capped.validate(["a", "b", "c"])).toBe(false);
		expect(() => capped.parse(["a", "b", "c"])).toThrow();
	});

	test("only a maximum is expressible", () => {
		// `array<string, 1, 10>` is a parse error — SurrealQL takes one bound. A
		// minimum has to be an ASSERT, which smig emitted as a second argument.
		expect(printSurqlType(t.array(t.string(), 10))).not.toContain(", 1,");
	});
});

describe("Modifiers record their metadata", () => {
	test("default and defaultAlways", () => {
		expect(t.bool().default(true).ddl.default).toEqual({
			value: true,
			always: false,
		});
		expect(t.date().defaultAlways("time::now()").ddl.default).toEqual({
			value: "time::now()",
			always: true,
		});
	});

	test("defaultLiteral marks the value as data", () => {
		expect(t.string().defaultLiteral("time::now()").ddl.default).toEqual({
			value: "time::now()",
			always: false,
			literal: true,
		});
	});

	test("a plain default is not marked literal", () => {
		expect(t.string().default("draft").ddl.default?.literal).toBeUndefined();
	});

	test("readonly and flexible", () => {
		expect(t.string().readonly().ddl.readonly).toBe(true);
		expect(t.object({}).flexible().ddl.flexible).toBe(true);
	});

	test("valueExpr and computed are kept apart", () => {
		// SurrealDB stores both as VALUE; only the braced form defers evaluation
		expect(t.string().valueExpr("$value").ddl.value).toBe("$value");
		expect(t.string().valueExpr("$value").ddl.computed).toBeUndefined();
		expect(t.int().computed("1 + 1").ddl.computed).toBe("1 + 1");
	});

	test("assert accumulates rather than replacing", () => {
		const age = t.int().assert("$value >= 0").assert("$value <= 150");

		expect(age.ddl.assert).toEqual(["$value >= 0", "$value <= 150"]);
	});

	test("references and onDelete build one reference", () => {
		const link = t.record("user").references("user").onDelete("UNSET");

		expect(link.ddl.reference).toEqual({ table: "user", onDelete: "UNSET" });
	});

	test("onDelete accepts each action SurrealDB parses", () => {
		// SET NULL, SET DEFAULT and RESTRICT are parse errors in 3.2, so they are
		// not in the union — UNSET clears the link and REJECT blocks the delete.
		const actions = ["CASCADE", "IGNORE", "REJECT", "UNSET"] as const;

		for (const action of actions) {
			expect(t.record("user").onDelete(action).ddl.reference?.onDelete).toBe(
				action,
			);
		}

		expect(
			t.record("user").onDelete("THEN $this.owner = NONE").ddl.reference
				?.onDelete,
		).toBe("THEN $this.owner = NONE");
	});

	test("permissions and comment", () => {
		expect(t.string().permissions("FOR select FULL").ddl.permissions).toBe(
			"FOR select FULL",
		);
		expect(t.string().comment("A note").ddl.comment).toBe("A note");
	});

	test("was accumulates previous names", () => {
		expect(t.string().was("old").ddl.previousNames).toEqual(["old"]);
		expect(t.string().was("v1", "v2").ddl.previousNames).toEqual(["v1", "v2"]);
		expect(t.string().was("first").was("second").ddl.previousNames).toEqual([
			"first",
			"second",
		]);
	});
});

describe("Modifiers never mutate", () => {
	test("the receiver is left untouched", () => {
		// The same `t.string()` can be assigned to two fields, so mutating in
		// place would let one field's constraints leak into another.
		const base = t.string();
		const derived = base.readonly().comment("Derived");

		expect(base.ddl).toEqual({});
		expect(derived.ddl.readonly).toBe(true);
	});

	test("the concrete subclass survives a chain", () => {
		// `resolveAccessType` dispatches on `instanceof RecordType`, so a modifier
		// that downgraded the class would break record-link traversal.
		const link = t.record("user").readonly().comment("x").assert("true");

		expect(printSurqlType(link)).toBe("record<user>");
	});

	test("a chain does not disturb the printed type", () => {
		const bounded = t.array(t.string(), 3).default([]).readonly();

		expect(printSurqlType(bounded)).toBe("array<string, 3>");
	});
});
