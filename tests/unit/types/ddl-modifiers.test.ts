import { describe, expect, test } from "bun:test";
import { orm, t, table } from "../../../src";
import { RecordType, StringType } from "../../../src/types/classes";

describe("Schema modifiers", () => {
	test("record their metadata", () => {
		const type = t
			.string()
			.assert("string::len($value) > 2")
			.default("anon")
			.readonly()
			.comment("The display name");

		expect(type.ddl.assert).toEqual(["string::len($value) > 2"]);
		expect(type.ddl.default).toEqual({ value: "anon", always: false });
		expect(type.ddl.readonly).toBe(true);
		expect(type.ddl.comment).toBe("The display name");
	});

	test("accumulate multiple asserts in order", () => {
		const type = t.string().assert("a").assert("b");
		expect(type.ddl.assert).toEqual(["a", "b"]);
	});

	test("defaultAlways is distinguishable from default", () => {
		expect(t.date().default("time::now()").ddl.default?.always).toBe(false);
		expect(t.date().defaultAlways("time::now()").ddl.default?.always).toBe(
			true,
		);
	});

	test("references and onDelete compose into one clause", () => {
		const type = t.record("user").references("user").onDelete("CASCADE");
		expect(type.ddl.reference).toEqual({ table: "user", onDelete: "CASCADE" });
	});

	test("was accumulates previous names", () => {
		expect(t.string().was("a").was("b", "c").ddl.previousNames).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	test("are immutable — a modifier never mutates its receiver", () => {
		// Types are shared freely between fields, so mutating in place would let
		// one field's constraints leak into another.
		const base = t.string();
		const derived = base.assert("x");

		expect(base.ddl.assert).toBeUndefined();
		expect(derived.ddl.assert).toEqual(["x"]);
		expect(derived).not.toBe(base);
	});

	test("preserve the concrete subclass through a chain", () => {
		// resolveAccessType dispatches on `instanceof RecordType` at runtime, so a
		// modifier that downgraded the class would break record-link traversal.
		const type = t.record("user").assert("x").readonly();
		expect(type).toBeInstanceOf(RecordType);
		expect(type.tb).toBe("user");

		expect(t.string().comment("c")).toBeInstanceOf(StringType);
	});

	test("leave validation untouched", () => {
		const type = t.string().assert("string::len($value) > 2").readonly();
		expect(type.validate("hi")).toBe(true);
		expect(type.validate(1)).toBe(false);
	});
});

describe("Schema modifiers and inference", () => {
	test("a modified field infers the same type as an unmodified one", () => {
		const user = table("user", {
			plain: t.string(),
			modified: t.string().assert("x").readonly().comment("y"),
			link: t.record("post").references("post"),
		});

		type Row = (typeof user)["type"];
		const row: Row = {
			id: null as never,
			plain: "a",
			modified: "b",
			link: null as never,
		};

		// The assertions that matter are the type annotations above; this keeps
		// the values used at runtime too.
		expect(row.plain).toBe("a");
		expect(row.modified).toBe("b");
	});

	test("a modified schema still drives the query builder", () => {
		const user = table("user", {
			name: t.string().assert("string::len($value) > 2"),
			age: t.int().default(0),
		});
		const db = orm(null as never, user);

		const query = db.select("user").where((u) => u.age.gte(18));
		expect(query).toBeDefined();
	});
});
