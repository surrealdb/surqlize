import { describe, expect, test } from "bun:test";
import { edge, t, table } from "../../../src";
import {
	defineField,
	defineSchema,
	defineTable,
} from "../../../src/schema/ddl/define";
import { defineEvent } from "../../../src/schema/ddl/event-ddl";
import { flattenFields } from "../../../src/schema/ddl/flatten";
import { defineIndex } from "../../../src/schema/ddl/index-ddl";

/**
 * The exact SurrealQL each generator emits.
 *
 * Clause order is not free-form — several of these assertions exist because the
 * wrong order is a parse error rather than a cosmetic difference. The
 * counterpart integration suite runs the same statements against a live server;
 * these pin the strings without needing one.
 */

/** Render one field of a table, by name. */
function field(
	schema: Parameters<typeof defineSchema>[0],
	name: string,
): string {
	const found = flattenFields(schema.fields).find((f) => f.name === name);
	if (!found) throw new Error(`No field ${name}`);

	return defineField(schema.tb, found);
}

describe("DEFINE TABLE", () => {
	test("is schemafull by default", () => {
		expect(defineTable(table("user", {}))).toBe(
			"DEFINE TABLE user TYPE NORMAL SCHEMAFULL;",
		);
	});

	test("opts out to schemaless", () => {
		expect(defineTable(table("logs", {}).schemaless())).toBe(
			"DEFINE TABLE logs TYPE NORMAL SCHEMALESS;",
		);
	});

	test("an edge is a relation with IN and OUT", () => {
		const sql = defineTable(edge("user", "follows", "user", {}));

		expect(sql).toContain("TYPE RELATION");
		expect(sql).toContain("IN user");
		expect(sql).toContain("OUT user");
	});

	test("an edge across several tables lists them", () => {
		const sql = defineTable(edge(["post", "user"], "tagged", "tag", {}));

		expect(sql).toContain("IN post | user");
		expect(sql).toContain("OUT tag");
	});

	test("ENFORCED follows the relation clause", () => {
		expect(
			defineTable(edge("user", "follows", "user", {}).enforced()),
		).toContain("OUT user ENFORCED");
	});

	test("carries a changefeed", () => {
		const sql = defineTable(table("orders", {}).changefeed("7d", true));

		expect(sql).toContain("CHANGEFEED 7d");
		expect(sql).toContain("INCLUDE ORIGINAL");
	});

	test("carries DROP before the schema mode", () => {
		expect(defineTable(table("temp", {}).drop())).toContain("DROP SCHEMAFULL");
	});

	test("carries a view and a comment", () => {
		const sql = defineTable(
			table("summary", {}).view("SELECT count() FROM post").comment("Rollup"),
		);

		expect(sql).toContain("AS SELECT count() FROM post");
		expect(sql).toContain("COMMENT 'Rollup'");
	});

	test("a per-operation permission rule is introduced with WHERE", () => {
		// SurrealDB rejects a bare condition with "expected 'NONE', 'FULL', or
		// 'WHERE'". The examples caught this; nothing else was passing an
		// expression rather than FULL or NONE.
		const sql = defineTable(
			table("order", {}).permissions({
				select: "$auth.id = customer",
				create: "$auth.id != NONE",
				update: "FULL",
				delete: "NONE",
			}),
		);

		expect(sql).toContain("FOR select WHERE $auth.id = customer");
		expect(sql).toContain("FOR create WHERE $auth.id != NONE");
		expect(sql).toContain("FOR update FULL");
		expect(sql).toContain("FOR delete NONE");
	});

	test("a rule that already says WHERE is not given a second one", () => {
		expect(
			defineTable(table("t", {}).permissions({ select: "WHERE $auth" })),
		).toContain("FOR select WHERE $auth");
	});

	test("a single rule for everything is passed through as written", () => {
		expect(defineTable(table("t", {}).permissions("NONE"))).toContain(
			"PERMISSIONS NONE",
		);
	});

	test("OVERWRITE is requested, not implied", () => {
		expect(defineTable(table("user", {}))).not.toContain("OVERWRITE");
		expect(defineTable(table("user", {}), { overwrite: true })).toContain(
			"DEFINE TABLE OVERWRITE user",
		);
	});
});

describe("DEFINE FIELD", () => {
	test("names the table and the type", () => {
		expect(field(table("user", { email: t.string() }), "email")).toBe(
			"DEFINE FIELD email ON TABLE user TYPE string;",
		);
	});

	test("carries a default", () => {
		expect(
			field(table("user", { active: t.bool().default(true) }), "active"),
		).toContain("DEFAULT true");
	});

	test("carries DEFAULT ALWAYS", () => {
		const schema = table("user", {
			updatedAt: t.date().defaultAlways("time::now()"),
		});

		expect(field(schema, "updatedAt")).toContain("DEFAULT ALWAYS time::now()");
	});

	test("carries READONLY", () => {
		expect(
			field(table("user", { createdAt: t.date().readonly() }), "createdAt"),
		).toContain("READONLY");
	});

	test("carries an assert", () => {
		const schema = table("user", {
			age: t.int().assert("$value >= 0").assert("$value <= 150"),
		});

		expect(field(schema, "age")).toContain(
			"ASSERT $value >= 0 AND $value <= 150",
		);
	});

	test("FLEXIBLE follows the type, not precedes it", () => {
		// `FLEXIBLE TYPE object` is a parse error — "FLEXIBLE must be specified
		// after TYPE". smig emitted the rejected order.
		const sql = field(
			table("user", { metadata: t.object({}).flexible() }),
			"metadata",
		);

		expect(sql).toContain("TYPE object FLEXIBLE");
		expect(sql).not.toContain("FLEXIBLE TYPE");
	});

	test("carries a reference and its delete action", () => {
		const schema = table("post", {
			authorId: t.record("user").references().onDelete("CASCADE"),
		});

		expect(field(schema, "authorId")).toContain("REFERENCE ON DELETE CASCADE");
	});

	test("VALUE is emitted plain, and braced when computed", () => {
		const schema = table("t", {
			slug: t.string().valueExpr("string::slug($value)"),
			total: t.int().computed("$this.a + $this.b"),
		});

		expect(field(schema, "slug")).toContain("VALUE string::slug($value)");
		expect(field(schema, "total")).toContain("VALUE { $this.a + $this.b }");
	});

	test("permissions and a comment come last, in that order", () => {
		const schema = table("t", {
			secret: t.string().permissions("FOR select NONE").comment("Hidden"),
		});

		expect(field(schema, "secret")).toEndWith(
			"PERMISSIONS FOR select NONE COMMENT 'Hidden';",
		);
	});
});

describe("DEFINE INDEX", () => {
	test("indexes columns", () => {
		expect(defineIndex("user", { name: "idx_email", fields: ["email"] })).toBe(
			"DEFINE INDEX idx_email ON TABLE user FIELDS email;",
		);
	});

	test("carries UNIQUE", () => {
		expect(
			defineIndex("user", { name: "u", fields: ["email"], unique: true }),
		).toContain("UNIQUE");
	});

	test("full-text takes an analyzer and highlights", () => {
		const sql = defineIndex("post", {
			name: "s",
			fields: ["content"],
			fulltext: { analyzer: "english", highlights: true },
		});

		// SEARCH was renamed to FULLTEXT in 3.x; the old spelling is a parse error
		expect(sql).toContain("FULLTEXT");
		expect(sql).not.toContain("SEARCH");
		expect(sql).toContain("ANALYZER english");
		expect(sql).toContain("HIGHLIGHTS");
	});

	test("full-text names the built-in analyzer when given none", () => {
		// SurrealDB fills in `like` and reports it, so an index that stayed silent
		// would look modified on every run
		const sql = defineIndex("post", {
			name: "s",
			fields: ["c"],
			fulltext: true,
		});

		expect(sql).toContain("FULLTEXT ANALYZER like");
	});

	test("BM25 is emitted tuned or at its defaults", () => {
		expect(
			defineIndex("post", {
				name: "s",
				fields: ["c"],
				fulltext: { bm25: { k1: 1.2, b: 0.75 } },
			}),
		).toContain("BM25(1.2,0.75)");
	});

	test("HNSW fills in every parameter SurrealDB would", () => {
		// A bare `HNSW DIMENSION 3 DIST COSINE` reads back with TYPE, EFC, M and
		// M0 filled in, so an index that omitted them would never converge.
		const sql = defineIndex("post", {
			name: "v",
			fields: ["embedding"],
			hnsw: { dimension: 1536, dist: "EUCLIDEAN", efc: 200, m: 16 },
		});

		expect(sql).toContain("HNSW");
		expect(sql).toContain("DIMENSION 1536");
		expect(sql).toContain("DIST EUCLIDEAN");
		expect(sql).toContain("EFC 200");
		expect(sql).toContain("M 16");
		expect(sql).toContain("M0 32");
		expect(sql).toContain("TYPE F32");
	});

	test("a COUNT index covers the table, so takes no columns", () => {
		const sql = defineIndex("post", { name: "c", count: true });

		expect(sql).toBe("DEFINE INDEX c ON TABLE post COUNT;");
		expect(sql).not.toContain("FIELDS");
	});

	test("a full-text index over several columns is refused", () => {
		// SurrealDB fails this with "Expected one column, found 2", but only once
		// the statement reaches the server — mid-migration.
		expect(() =>
			defineIndex("post", {
				name: "s",
				fields: ["title", "body"],
				fulltext: true,
			}),
		).toThrow(/exactly one column/i);

		expect(() =>
			defineIndex("post", { name: "s", fields: ["body"], fulltext: true }),
		).not.toThrow();
	});

	test("a vector index over several columns is refused", () => {
		expect(() =>
			defineIndex("post", {
				name: "v",
				fields: ["a", "b"],
				hnsw: { dimension: 3 },
			}),
		).toThrow(/exactly one column/i);
	});

	test("an ordinary index over several columns is fine", () => {
		expect(
			defineIndex("post", { name: "i", fields: ["a", "b"], unique: true }),
		).toContain("FIELDS a, b");
	});

	test("carries CONCURRENTLY", () => {
		expect(
			defineIndex("user", { name: "i", fields: ["name"], concurrently: true }),
		).toContain("CONCURRENTLY");
	});
});

describe("DEFINE EVENT", () => {
	test("guards on the trigger and wraps the body", () => {
		const sql = defineEvent("user", {
			name: "on_update",
			on: "UPDATE",
			body: "UPDATE $after SET updatedAt = time::now()",
		});

		expect(sql).toContain("DEFINE EVENT on_update ON TABLE user");
		expect(sql).toContain('WHEN $event = "UPDATE"');
		expect(sql).toContain("THEN");
	});

	test("ANDs an extra condition onto the guard", () => {
		const sql = defineEvent("order", {
			name: "notify",
			on: "CREATE",
			when: "$after.total > 1000",
			body: "CREATE notification SET message = 'High value order'",
		});

		// SurrealDB drops parentheses it does not need, so adding them here would
		// leave the event looking modified on every run
		expect(sql).toContain('WHEN $event = "CREATE" AND $after.total > 1000');
	});

	test("several triggers are ORed, then bracketed before the AND", () => {
		// Without the brackets the condition would swallow the guard and the
		// event would fire on operations it was never meant to.
		const sql = defineEvent("t", {
			name: "e",
			on: ["CREATE", "UPDATE"],
			when: "$after.flag",
			body: "RETURN 1",
		});

		expect(sql).toContain(
			'WHEN ($event = "CREATE" OR $event = "UPDATE") AND $after.flag',
		);
	});

	test("no trigger and no condition fires on every change, never on NULL", () => {
		// `WHEN NULL` is valid SurrealQL that silently never fires
		const sql = defineEvent("t", { name: "e", body: "RETURN 1" });

		expect(sql).toContain("WHEN true");
		expect(sql).not.toContain("NULL");
	});
});

describe("A whole schema", () => {
	test("defines the table, then fields, then indexes, then events", () => {
		const user = table("user", { email: t.string() })
			.index("idx", { fields: ["email"], unique: true })
			.event("ev", { on: "CREATE", body: "RETURN 1" });

		const kinds = defineSchema(user).map((s) =>
			s.split(" ").slice(0, 2).join(" "),
		);

		expect(kinds).toEqual([
			"DEFINE TABLE",
			"DEFINE FIELD",
			"DEFINE INDEX",
			"DEFINE EVENT",
		]);
	});

	test("never defines the injected id", () => {
		// `id` is injected as `record<tb>` for the row type, which SurrealDB
		// rejects: "not a valid record id key"
		expect(
			defineSchema(table("user", { name: t.string() })).join("\n"),
		).not.toContain("DEFINE FIELD id");
	});

	test("defines a declared id", () => {
		const sql = defineSchema(
			table("doc", {
				id: t.uuid().default("rand::uuid::v7()"),
				title: t.string(),
			}),
		).join("\n");

		expect(sql).toContain("DEFINE FIELD id ON TABLE doc TYPE uuid");
	});

	test("never redefines an edge's in and out", () => {
		const sql = defineSchema(
			edge("user", "liked", "post", { at: t.date() }),
		).join("\n");

		expect(sql).not.toContain("DEFINE FIELD in");
		expect(sql).not.toContain("DEFINE FIELD out");
		expect(sql).toContain("DEFINE FIELD at");
	});
});
