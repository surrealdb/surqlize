import { describe, expect, test } from "bun:test";
import { t, table } from "../../../src";
import { defineField } from "../../../src/schema/ddl/define";
import { flattenFields } from "../../../src/schema/ddl/flatten";
import type { AbstractType } from "../../../src/types/classes";

/**
 * How a `DEFAULT` value is rendered.
 *
 * The interesting case is a string: a literal has to be quoted and an
 * expression must not be, and getting it backwards is silent — `DEFAULT
 * 'time::now()'` is valid SurrealQL that stores the text of the call.
 */

/** The `DEFAULT` clause a value produces, or null if there is none. */
function defaultClause(
	value: unknown,
	type: AbstractType = t.string(),
): string | null {
	const schema = table("probe", {
		f: value === undefined ? type : type.default(value),
	});
	const flat = flattenFields(schema.fields).find((f) => f.name === "f");
	const sql = defineField("probe", flat!);
	const match = sql.match(/DEFAULT (.*);$/);

	return match?.[1] ?? null;
}

describe("Strings", () => {
	test("a literal is single-quoted", () => {
		// SurrealDB stores string literals single-quoted, so emitting them that
		// way keeps a declared default equal to the introspected one.
		expect(defaultClause("pending")).toBe("'pending'");
	});

	test("a value holding an apostrophe switches to double quotes", () => {
		// SurrealDB picks whichever quote avoids escaping, and stores it that way
		expect(defaultClause("it's")).toBe('"it\'s"');
	});

	test("a value holding a double quote stays single-quoted", () => {
		expect(defaultClause('say "hi"')).toBe(`'say "hi"'`);
	});

	test("a function call is left as an expression", () => {
		expect(defaultClause("time::now()", t.date())).toBe("time::now()");
		expect(defaultClause("rand::uuid::v7()", t.uuid())).toBe(
			"rand::uuid::v7()",
		);
	});

	test("a variable reference is left as an expression", () => {
		expect(defaultClause("$auth.id", t.record("user"))).toBe("$auth.id");
	});

	test("defaultLiteral stores a call as text rather than calling it", () => {
		// The escape hatch for the one case the heuristic cannot express
		const schema = table("probe", {
			f: t.string().defaultLiteral("time::now()"),
		});
		const flat = flattenFields(schema.fields).find((f) => f.name === "f");

		expect(defineField("probe", flat!)).toContain("DEFAULT 'time::now()'");
	});

	test("defaultLiteral quotes a value that needs no help too", () => {
		const schema = table("probe", { f: t.string().defaultLiteral("draft") });
		const flat = flattenFields(schema.fields).find((f) => f.name === "f");

		expect(defineField("probe", flat!)).toContain("DEFAULT 'draft'");
	});

	test("a bare word with a namespace but no call is quoted", () => {
		// Without parentheses there is nothing to distinguish `a::b` from text,
		// and quoting is the safe reading — an unquoted one is a parse error.
		expect(defaultClause("some::thing")).toBe("'some::thing'");
	});
});

describe("Numbers and booleans", () => {
	test("integers, floats and negatives are emitted bare", () => {
		expect(defaultClause(0, t.int())).toBe("0");
		expect(defaultClause(42, t.int())).toBe("42");
		expect(defaultClause(3.14, t.float())).toBe("3.14");
		expect(defaultClause(-1, t.int())).toBe("-1");
	});

	test("true and false are emitted bare", () => {
		expect(defaultClause(true, t.bool())).toBe("true");
		expect(defaultClause(false, t.bool())).toBe("false");
	});

	test("false is emitted rather than treated as absent", () => {
		// A falsy check here would drop the clause entirely
		expect(defaultClause(false, t.bool())).not.toBeNull();
	});

	test("zero is emitted rather than treated as absent", () => {
		expect(defaultClause(0, t.int())).not.toBeNull();
	});
});

describe("Collections", () => {
	const list = t.array(t.string());

	test("an empty array is emitted as one", () => {
		expect(defaultClause([], list)).toBe("[]");
	});

	test("string elements are quoted", () => {
		expect(defaultClause(["a", "b"], list)).toBe('["a","b"]');
	});

	test("number elements are not", () => {
		expect(defaultClause([1, 2], t.array(t.int()))).toBe("[1,2]");
	});

	test("an empty object is emitted as one", () => {
		expect(defaultClause({}, t.object({}))).toBe("{}");
	});

	test("an object keeps its keys and values", () => {
		expect(defaultClause({ a: 1, b: "x" }, t.object({}))).toBe(
			'{"a":1,"b":"x"}',
		);
	});
});

describe("Absence", () => {
	test("no default means no clause", () => {
		expect(defaultClause(undefined)).toBeNull();
	});

	test("null is NULL, which is not the same as absent", () => {
		expect(defaultClause(null, t.option(t.string()))).toBe("NULL");
	});
});
