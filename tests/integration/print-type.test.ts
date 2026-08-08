import { describe, expect, test } from "bun:test";
import { t } from "../../src";
import { printSurqlType } from "../../src/schema/ddl/print-type";
import type { AbstractType } from "../../src/types/classes";
import { withTestDb } from "./setup";

/**
 * Every type expression the printer can emit must actually parse.
 *
 * A generated type that SurrealDB rejects is invisible to unit tests — the
 * string looks plausible and only fails when a migration runs. This caught
 * `range<datetime>`, which reads naturally but is a parse error: SurrealDB
 * ranges carry no element type.
 */
describe("Generated type expressions are valid SurrealQL", () => {
	const db = withTestDb(async (testDb) => {
		await testDb.surreal.query("DEFINE TABLE type_probe SCHEMAFULL;");
	});

	const cases: [string, AbstractType][] = [
		["string", t.string()],
		["bool", t.bool()],
		["datetime", t.date()],
		["uuid", t.uuid()],
		["duration", t.duration()],
		["bytes", t.bytes()],
		["any", t.any()],
		["null", t.null()],
		["none", t.none()],
		["number", t.number()],
		["int", t.int()],
		["float", t.float()],
		["decimal", t.decimal()],
		["object", t.object({ a: t.string() })],
		["option", t.option(t.string())],
		["array", t.array(t.int())],
		["set", t.set(t.string())],
		["record (single)", t.record("user")],
		["record (multi)", t.record(["post", "user"])],
		["record (any)", t.record()],
		["geometry (kinded)", t.geometry("point")],
		["geometry (any)", t.geometry()],
		["range", t.range()],
		["literal", t.literal("active")],
		["union", t.union([t.literal("a"), t.literal("b")])],
		["tuple", t.array([t.string(), t.int()])],
		["deeply nested", t.option(t.array(t.option(t.record("user"))))],
	];

	test.each(cases)("%s parses", async (name, type) => {
		const surql = printSurqlType(type);
		const field = `f_${name.replace(/[^a-z0-9]/gi, "_")}`;

		// The assertion is that this does not throw: an invalid type expression
		// comes back as a parse error.
		await db().surreal.query(
			`DEFINE FIELD ${field} ON TABLE type_probe TYPE ${surql};`,
		);

		const [info] = await db().surreal.query<
			[{ fields: Record<string, string> }]
		>("INFO FOR TABLE type_probe;");
		expect(info.fields[field]).toBeDefined();
	});

	/**
	 * SurrealDB rewrites some type expressions when it stores them. Comparing a
	 * declared type against an introspected one has to account for this, or a
	 * schema will look permanently modified.
	 */
	test("option<T> is stored as `none | T`", async () => {
		await db().surreal.query(
			"DEFINE FIELD opt ON TABLE type_probe TYPE option<string>;",
		);

		const [info] = await db().surreal.query<
			[{ fields: Record<string, string> }]
		>("INFO FOR TABLE type_probe;");

		expect(info.fields.opt).toContain("TYPE none | string");
		expect(info.fields.opt).not.toContain("option<string>");
	});

	test("the rewrite applies at every level of nesting", async () => {
		await db().surreal.query(
			"DEFINE FIELD deep ON TABLE type_probe TYPE option<array<option<record<user>>>>;",
		);

		const [info] = await db().surreal.query<
			[{ fields: Record<string, string> }]
		>("INFO FOR TABLE type_probe;");

		expect(info.fields.deep).toContain(
			"TYPE none | array<none | record<user>>",
		);
	});
});
