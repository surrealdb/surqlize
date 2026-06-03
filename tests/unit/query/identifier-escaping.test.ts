import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { orm, t, table } from "../../../src";

/**
 * Field identifiers are interpolated directly into the rendered SurrealQL (only
 * values are bound as parameters), so any field name that is not a bare
 * identifier must be quoted with SurrealDB's `⟨…⟩` form. These tests use a
 * schema whose field names require escaping to pin that behaviour, and also
 * assert that ordinary names are emitted unchanged.
 */
describe("identifier escaping", () => {
	// Field names that are NOT bare SurrealQL identifiers.
	const user = table("user", {
		"first name": t.string(),
		"x; DROP": t.number(),
		age: t.number(),
	});

	const post = table("post", {
		title: t.string(),
		author: t.record("user"),
	});

	const db = orm(new Surreal(), user, post);

	test("ORDER BY quotes non-identifier field names", () => {
		const sql = db.select("user").orderBy("first name").toString();
		expect(sql).toContain("ORDER BY ⟨first name⟩");
	});

	test("GROUP BY and SPLIT quote non-identifier field names", () => {
		expect(db.select("user").groupBy("first name").toString()).toContain(
			"GROUP BY ⟨first name⟩",
		);
		expect(db.select("user").split("x; DROP").toString()).toContain(
			"SPLIT ⟨x; DROP⟩",
		);
	});

	test("SET assignments quote non-identifier field names", () => {
		const sql = db.update("user").set({ "first name": "ada" }).toString();
		expect(sql).toContain("⟨first name⟩ =");
		// The value itself is still bound as a parameter, not inlined.
		expect(sql).not.toContain("ada");
	});

	test("UNSET quotes non-identifier field names", () => {
		const sql = db.update("user").unset(["first name"]).toString();
		expect(sql).toContain("UNSET ⟨first name⟩");
	});

	test("INSERT column list quotes non-identifier field names", () => {
		const sql = db
			.insert("user")
			.fields(["first name"])
			.values(["ada"])
			.toString();
		expect(sql).toContain("(⟨first name⟩)");
	});

	test("a SurrealQL-injection attempt in a field name is neutralised", () => {
		const sql = db.select("user").orderBy("x; DROP").toString();
		// Quoted as a single identifier — the `;` cannot terminate the statement.
		expect(sql).toContain("⟨x; DROP⟩");
		expect(sql).not.toContain("ORDER BY x; DROP");
	});

	test("ordinary identifiers are emitted unchanged", () => {
		expect(db.select("user").orderBy("age").toString()).toContain(
			"ORDER BY age",
		);
		expect(db.select("user").orderBy("age").toString()).not.toContain("⟨");

		// Dotted FETCH paths keep their `.` separators and stay unquoted when each
		// segment is a bare identifier.
		const fetched = db.select("post").fetch("author").toString();
		expect(fetched).toContain("FETCH author");
		expect(fetched).not.toContain("⟨");
	});
});
