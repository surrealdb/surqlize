import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table, vector } from "../../../src";
import { OrmError } from "../../../src/error";

function render(query: unknown) {
	const ctx = displayContext();
	const sql = (
		query as { [__display]: (ctx: ReturnType<typeof displayContext>) => string }
	)[__display](ctx);
	return { sql, values: Object.values(ctx.variables) };
}

describe("ORDER BY an expression", () => {
	const doc = table("doc", {
		title: t.string(),
		age: t.number(),
		name: t.object({ first: t.string(), last: t.string() }),
		embedding: t.array(t.number()),
	});

	const db = orm(new Surreal(), doc);

	test("a function call is hoisted into the projection under an alias and removed by OMIT", () => {
		const { sql } = render(
			db.select("doc").orderBy((d) => vector.magnitude(d.embedding), "DESC"),
		);

		expect(sql).toContain(
			"SELECT *, vector::magnitude($this.embedding) AS __order_0 OMIT __order_0 FROM",
		);
		expect(sql).toContain("ORDER BY __order_0 DESC");
	});

	test("the expression is not placed directly after ORDER BY (SurrealQL rejects it there)", () => {
		const { sql } = render(
			db.select("doc").orderBy((d) => vector.magnitude(d.embedding)),
		);
		expect(sql).not.toContain("ORDER BY vector::");
	});

	test("field-path callbacks still render as plain idioms and are not hoisted", () => {
		const { sql } = render(db.select("doc").orderBy((d) => d.name.last, "ASC"));

		expect(sql).toContain("ORDER BY $this.name.last ASC");
		expect(sql).not.toContain("__order_");
		expect(sql).toContain("SELECT * FROM");
	});

	test("string field names still render as plain idioms", () => {
		const { sql } = render(db.select("doc").orderBy("age", "ASC"));
		expect(sql).toContain("ORDER BY age ASC");
		expect(sql).not.toContain("__order_");
	});

	test("expressions mix with field keys, keeping call order", () => {
		const { sql } = render(
			db
				.select("doc")
				.orderBy("title", "ASC")
				.orderBy((d) => vector.magnitude(d.embedding), "DESC")
				.orderBy("age", "DESC"),
		);

		expect(sql).toContain("ORDER BY title ASC, __order_0 DESC, age DESC");
		expect(sql).toContain("AS __order_0 OMIT __order_0");
	});

	test("each expression gets its own alias", () => {
		const { sql } = render(
			db
				.select("doc")
				.orderBy((d) => vector.magnitude(d.embedding), "ASC")
				.orderBy((d) => vector.magnitude(d.embedding), "DESC"),
		);

		expect(sql).toContain("AS __order_0");
		expect(sql).toContain("AS __order_1");
		expect(sql).toContain("ORDER BY __order_0 ASC, __order_1 DESC");
	});

	test("an expression sort combined with return() is rejected rather than leaking its alias", () => {
		const query = db
			.select("doc")
			.orderBy((d) => vector.magnitude(d.embedding), "DESC")
			.return((d) => ({ title: d.title }));

		expect(() => render(query)).toThrow(OrmError);
	});

	test("an expression sort combined with groupBy() is rejected: a grouped sort key must be a selected field", () => {
		const query = db
			.select("doc")
			.groupBy("title")
			.orderBy((d) => vector.magnitude(d.embedding), "DESC")
			.return((d) => ({ title: d.title }));

		expect(() => render(query)).toThrow(
			/cannot be combined with groupBy\(\) or groupAll\(\)/,
		);
	});

	test("an expression sort combined with groupAll() is rejected the same way", () => {
		const query = db
			.select("doc")
			.groupAll()
			.orderBy((d) => vector.magnitude(d.embedding));

		expect(() => render(query)).toThrow(
			/cannot be combined with groupBy\(\) or groupAll\(\)/,
		);
	});

	test("an expression sort with split() is hoisted, and renders bare beside the split row", () => {
		const { sql } = render(
			db
				.select("doc")
				.split("embedding")
				.orderBy((d) => vector.magnitude(d.embedding), "DESC"),
		);

		expect(sql).toContain(
			"SELECT *, vector::magnitude(embedding) AS __order_0 OMIT __order_0 FROM $_v0 SPLIT embedding ORDER BY __order_0 DESC",
		);
	});

	test("orderByNumeric and orderByCollate accept expressions too", () => {
		const { sql } = render(
			db
				.select("doc")
				.orderByNumeric((d) => vector.magnitude(d.embedding), "DESC"),
		);
		expect(sql).toContain("ORDER BY __order_0 NUMERIC DESC");
	});
});
