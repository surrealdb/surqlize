import { describe, expect, test } from "bun:test";
import {
	canonicalise,
	equivalent,
	normaliseTypeExpression,
} from "../../../src/migrator/canonical";

/**
 * Each rewrite the comparison applies, pinned individually.
 *
 * The integration suite round-trips whole definitions through a live server,
 * which proves the rules work together but says little about which one did
 * what. These pin them one at a time, using strings SurrealDB actually
 * returns — every "stored" value here was copied from `INFO FOR TABLE` output.
 *
 * A rule that stops firing shows up as a schema that looks permanently
 * modified: the migration reapplies the same change on every run.
 */

describe("Spelling differences that mean nothing", () => {
	test("ON TABLE t is stored as ON t", () => {
		expect(
			equivalent(
				"DEFINE FIELD name ON TABLE user TYPE string;",
				"DEFINE FIELD name ON user TYPE string PERMISSIONS FULL",
			),
		).toBe(true);
	});

	test("OVERWRITE says how to apply a statement, not what it defines", () => {
		expect(
			equivalent(
				"DEFINE FIELD OVERWRITE name ON TABLE user TYPE string;",
				"DEFINE FIELD name ON user TYPE string PERMISSIONS FULL",
			),
		).toBe(true);
	});

	test("backticked identifiers match their bare form", () => {
		// SurrealDB backticks function namespaces and reserved-word field names
		expect(
			equivalent(
				"DEFINE FIELD id ON TABLE doc TYPE uuid DEFAULT rand::uuid::v7();",
				"DEFINE FIELD id ON doc TYPE uuid DEFAULT `rand`::uuid::v7() PERMISSIONS FULL",
			),
		).toBe(true);

		expect(
			equivalent(
				"DEFINE FIELD by ON TABLE post TYPE string;",
				"DEFINE FIELD `by` ON post TYPE string PERMISSIONS FULL",
			),
		).toBe(true);
	});

	test("an array element is defined with brackets and reported with dots", () => {
		expect(
			equivalent(
				"DEFINE FIELD items[*].sku ON TABLE cart TYPE string;",
				"DEFINE FIELD items.*.sku ON cart TYPE string PERMISSIONS FULL",
			),
		).toBe(true);
	});

	test("CONCURRENTLY is accepted but never stored", () => {
		expect(
			equivalent(
				"DEFINE INDEX i ON TABLE t FIELDS a CONCURRENTLY;",
				"DEFINE INDEX i ON t FIELDS a",
			),
		).toBe(true);
	});

	test("HNSW's derived LM is ignored", () => {
		// LM is derived from M as a long float; matching its printed precision is
		// fragile and it carries nothing M does not
		expect(
			equivalent(
				"DEFINE INDEX v ON TABLE t FIELDS e HNSW DIMENSION 3 DIST COSINE TYPE F32 EFC 150 M 12 M0 24;",
				"DEFINE INDEX v ON t FIELDS e HNSW DIMENSION 3 DIST COSINE TYPE F32 EFC 150 M 12 M0 24 LM 0.40242960438184466f",
			),
		).toBe(true);
	});

	test("string literals are stored single-quoted", () => {
		expect(
			equivalent(
				'DEFINE FIELD status ON TABLE t TYPE string DEFAULT "draft";',
				"DEFINE FIELD status ON t TYPE string DEFAULT 'draft' PERMISSIONS FULL",
			),
		).toBe(true);
	});

	test("an apostrophe inside a literal is left alone", () => {
		// Rewriting quotes around a string containing one would change it
		expect(
			canonicalise(`DEFINE FIELD a ON t TYPE string DEFAULT "it's"`),
		).toContain(`"it's"`);
	});

	test("whitespace and separator spacing carry no meaning", () => {
		// TOKENIZERS BLANK,CLASS is stored unspaced while FILTERS is spaced
		expect(
			equivalent(
				"DEFINE ANALYZER a TOKENIZERS blank, class FILTERS lowercase,ascii;",
				"DEFINE ANALYZER a TOKENIZERS blank,class FILTERS lowercase, ascii",
			),
		).toBe(true);
	});

	test("a duration is stored decomposed, however it was written", () => {
		// 30d reads back as 4w2d, 90m as 1h30m, 400d as 1y5w — a year being 365
		// days and a week seven.
		const pairs: [string, string][] = [
			["30d", "4w2d"],
			["7d", "1w"],
			["90d", "12w6d"],
			["90m", "1h30m"],
			["3600s", "1h"],
			["5000ms", "5s"],
			["400d", "1y5w"],
		];

		for (const [written, stored] of pairs) {
			expect(
				equivalent(
					`DEFINE ACCESS a ON DATABASE TYPE BEARER FOR USER DURATION FOR GRANT ${written}`,
					`DEFINE ACCESS a ON DATABASE TYPE BEARER FOR USER DURATION FOR GRANT ${stored}`,
				),
			).toBe(true);
		}
	});

	test("durations that differ are still different", () => {
		expect(
			equivalent(
				"DEFINE TABLE t TYPE NORMAL SCHEMAFULL CHANGEFEED 1d",
				"DEFINE TABLE t TYPE NORMAL SCHEMAFULL CHANGEFEED 2d",
			),
		).toBe(false);
	});

	test("a config is stored without its DEFINE CONFIG keyword", () => {
		expect(
			equivalent(
				"DEFINE CONFIG GRAPHQL TABLES AUTO FUNCTIONS AUTO;",
				"GRAPHQL TABLES AUTO FUNCTIONS AUTO",
			),
		).toBe(true);
	});

	test("a trailing semicolon is not part of the definition", () => {
		expect(canonicalise("DEFINE TABLE t TYPE NORMAL SCHEMAFULL;")).toBe(
			canonicalise("DEFINE TABLE t TYPE NORMAL SCHEMAFULL"),
		);
	});
});

describe("Clause order", () => {
	test("COMMENT and PERMISSIONS can be written either way round", () => {
		expect(
			equivalent(
				"DEFINE FIELD a ON TABLE t TYPE string PERMISSIONS FULL COMMENT 'x';",
				"DEFINE FIELD a ON t TYPE string COMMENT 'x' PERMISSIONS FULL",
			),
		).toBe(true);
	});

	test("a comment is part of the definition, not noise", () => {
		expect(
			equivalent(
				"DEFINE FIELD a ON t TYPE string COMMENT 'one'",
				"DEFINE FIELD a ON t TYPE string COMMENT 'two'",
			),
		).toBe(false);
	});
});

describe("option<T> is stored as none | T", () => {
	test("at the top level", () => {
		expect(normaliseTypeExpression("option<string>")).toBe("none | string");
	});

	test("at every level of nesting", () => {
		expect(normaliseTypeExpression("option<array<option<record<user>>>>")).toBe(
			"none | array<none | record<user>>",
		);
	});

	test("inside a type that is not itself optional", () => {
		expect(normaliseTypeExpression("array<option<int>>")).toBe(
			"array<none | int>",
		);
	});

	test("leaves a type with no option alone", () => {
		expect(normaliseTypeExpression("array<record<user>>")).toBe(
			"array<record<user>>",
		);
	});

	test("leaves an unbalanced expression alone rather than corrupting it", () => {
		expect(normaliseTypeExpression("option<string")).toBe("option<string");
	});

	test("applies to a whole statement's TYPE clause", () => {
		expect(
			equivalent(
				"DEFINE FIELD bio ON TABLE user TYPE option<string>;",
				"DEFINE FIELD bio ON user TYPE none | string PERMISSIONS FULL",
			),
		).toBe(true);
	});

	test("does not reach past the type into a later clause", () => {
		// `option` appearing in a default or comment is not a type
		const canonical = canonicalise(
			"DEFINE FIELD a ON t TYPE string COMMENT 'option<x>'",
		);

		expect(canonical).toContain("option<x>");
	});
});

describe("PERMISSIONS expansion", () => {
	test("a partial rule is filled in with the default for its kind", () => {
		// A field defaults to FULL, a table to NONE
		expect(
			equivalent(
				"DEFINE TABLE t TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select FULL;",
				"DEFINE TABLE t TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select FULL, FOR create, update, delete NONE",
			),
		).toBe(true);
	});

	test("an unmentioned field permission is FULL", () => {
		expect(
			equivalent(
				"DEFINE FIELD a ON TABLE t TYPE string;",
				"DEFINE FIELD a ON t TYPE string PERMISSIONS FULL",
			),
		).toBe(true);
	});

	test("an unmentioned table permission is NONE", () => {
		expect(
			equivalent(
				"DEFINE TABLE t TYPE NORMAL SCHEMAFULL;",
				"DEFINE TABLE t TYPE NORMAL SCHEMAFULL PERMISSIONS NONE",
			),
		).toBe(true);
	});

	test("operations are compared in a fixed order", () => {
		expect(
			equivalent(
				"DEFINE FIELD a ON t TYPE string PERMISSIONS FOR select, update NONE",
				"DEFINE FIELD a ON t TYPE string PERMISSIONS FOR update, select NONE",
			),
		).toBe(true);
	});

	test("a WHERE rule is kept with the operations it applies to", () => {
		expect(
			equivalent(
				"DEFINE FIELD a ON t TYPE string PERMISSIONS FOR select WHERE $auth.id = id",
				"DEFINE FIELD a ON t TYPE string PERMISSIONS FOR select WHERE $auth.id = id, FOR create, update, delete FULL",
			),
		).toBe(true);
	});

	test("differing rules are still reported as different", () => {
		expect(
			equivalent(
				"DEFINE TABLE t TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select FULL",
				"DEFINE TABLE t TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select NONE",
			),
		).toBe(false);
	});

	test("an entity's PERMISSIONS is a single value, not an expansion", () => {
		// Only fields and tables take a rule per operation
		expect(
			canonicalise(
				"DEFINE FUNCTION fn::f() { RETURN 1; } PERMISSIONS WHERE $auth",
			),
		).toContain("PERMISSIONS WHERE $auth");
	});
});

describe("An event's THEN body", () => {
	test("is stored parenthesised", () => {
		expect(
			equivalent(
				'DEFINE EVENT e ON TABLE t WHEN $event = "CREATE" THEN RETURN 1;',
				"DEFINE EVENT e ON t WHEN $event = 'CREATE' THEN (RETURN 1)",
			),
		).toBe(true);
	});

	test("keeps parentheses that are part of the body", () => {
		const canonical = canonicalise(
			"DEFINE EVENT e ON t WHEN true THEN (UPDATE $after SET n = (1 + 2))",
		);

		expect(canonical).toContain("(1 + 2)");
		expect(canonical).not.toContain("THEN (UPDATE");
	});

	test("leaves an unbalanced body alone rather than corrupting it", () => {
		const statement = "DEFINE EVENT e ON t WHEN true THEN (RETURN 1";

		expect(canonicalise(statement)).toContain("THEN (RETURN 1");
	});
});

describe("Genuine differences survive", () => {
	test("a different type is a difference", () => {
		expect(
			equivalent(
				"DEFINE FIELD a ON t TYPE string",
				"DEFINE FIELD a ON t TYPE int",
			),
		).toBe(false);
	});

	test("a different default is a difference", () => {
		expect(
			equivalent(
				"DEFINE FIELD a ON t TYPE int DEFAULT 0",
				"DEFINE FIELD a ON t TYPE int DEFAULT 1",
			),
		).toBe(false);
	});

	test("an added clause is a difference", () => {
		expect(
			equivalent(
				"DEFINE FIELD a ON t TYPE string",
				"DEFINE FIELD a ON t TYPE string READONLY",
			),
		).toBe(false);
	});

	test("a different table is a difference", () => {
		expect(
			equivalent(
				"DEFINE FIELD a ON t1 TYPE string",
				"DEFINE FIELD a ON t2 TYPE string",
			),
		).toBe(false);
	});

	describe("redundant `any` element types", () => {
		test("collapses array<any> the way SurrealDB stores it", () => {
			// `any` is the default element type, so naming it is redundant and
			// the server drops it. Without this the field never converges.
			expect(normaliseTypeExpression("array<any>")).toBe("array");
			expect(normaliseTypeExpression("set<any>")).toBe("set");
		});

		test("keeps a length parameter, which is not redundant", () => {
			expect(normaliseTypeExpression("array<any, 5>")).toBe("array<any, 5>");
		});

		test("keeps a real element type", () => {
			expect(normaliseTypeExpression("array<string>")).toBe("array<string>");
			expect(normaliseTypeExpression("array<record<user>>")).toBe(
				"array<record<user>>",
			);
		});

		test("collapses inside option, which nests both rewrites", () => {
			expect(normaliseTypeExpression("option<array<any>>")).toBe(
				"none | array",
			);
		});

		test("collapses when nested in another collection", () => {
			expect(normaliseTypeExpression("array<array<any>>")).toBe("array<array>");
		});

		test("a declared array<any> equals a stored array", () => {
			expect(
				equivalent(
					"DEFINE FIELD taxes ON quote TYPE array<any> DEFAULT []",
					"DEFINE FIELD taxes ON quote TYPE array DEFAULT []",
				),
			).toBe(true);
		});
	});
});
