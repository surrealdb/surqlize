import { describe, expect, test } from "bun:test";
import {
	access,
	analyzer,
	param,
	sequence,
	storedFunction,
} from "../../../src/schema/ddl/entities";

/**
 * The SurrealQL each database-level entity emits.
 *
 * Several of these pin a normalisation SurrealDB applies on read-back: a
 * definition that does not anticipate it looks permanently modified and the
 * migration never converges.
 */

describe("DEFINE ANALYZER", () => {
	test("lists tokenizers and filters", () => {
		const sql = analyzer("english_search", {
			tokenizers: ["class", "camel", "blank"],
			filters: ["lowercase", "ascii", "snowball(english)"],
		}).define();

		expect(sql).toContain("DEFINE ANALYZER english_search");
		expect(sql).toContain("TOKENIZERS class, camel, blank");
		expect(sql).toContain("FILTERS lowercase, ascii, snowball(english)");
	});

	test("omits FILTERS when there are none", () => {
		expect(analyzer("a", { tokenizers: ["blank"] }).define()).not.toContain(
			"FILTERS",
		);
	});

	test("removes by name", () => {
		expect(analyzer("a", { tokenizers: ["blank"] }).remove()).toBe(
			"REMOVE ANALYZER a;",
		);
	});
});

describe("DEFINE PARAM", () => {
	test("takes the leading $ on the name and the value verbatim", () => {
		expect(param("app_name", { value: "'My Application'" }).define()).toBe(
			"DEFINE PARAM $app_name VALUE 'My Application';",
		);
	});

	test("accepts a name already carrying its $", () => {
		expect(param("$app_name", { value: "1" }).define()).toStartWith(
			"DEFINE PARAM $app_name",
		);
	});
});

describe("DEFINE FUNCTION", () => {
	test("prefixes fn::, types its arguments and its return", () => {
		const sql = storedFunction("days_since", {
			args: [["time", "datetime"]],
			returns: "float",
			body: "RETURN <float> (time::now() - $time) / 60 / 60 / 24;",
		}).define();

		expect(sql).toContain("DEFINE FUNCTION fn::days_since($time: datetime)");
		expect(sql).toContain("-> float");
		expect(sql).toContain("RETURN");
	});

	test("does not double the fn:: prefix", () => {
		expect(
			storedFunction("fn::already", { body: "RETURN 1;" }).define(),
		).toContain("fn::already(");
	});

	test("carries permissions", () => {
		const sql = storedFunction("admin_only", {
			body: "RETURN true;",
			permissions: "WHERE $auth.role = 'admin'",
		}).define();

		expect(sql).toContain("PERMISSIONS WHERE $auth.role = 'admin'");
	});

	test("is keyed by its bare name, which is how INFO FOR DB reports it", () => {
		const fn = storedFunction("days_since", { body: "RETURN 1;" });

		expect(fn.name).toBe("fn::days_since");
		expect(fn.key).toBe("days_since");
	});
});

describe("DEFINE SEQUENCE", () => {
	test("always emits BATCH and START", () => {
		// A bare `DEFINE SEQUENCE s` reads back as `BATCH 1000 START 0`, so
		// omitting them would leave it looking permanently modified
		expect(sequence("basic").define()).toBe(
			"DEFINE SEQUENCE basic BATCH 1000 START 0;",
		);
	});

	test("carries a start and a batch size", () => {
		expect(
			sequence("order_number", { start: 1000, batch: 50 }).define(),
		).toContain("BATCH 50 START 1000");
	});
});

describe("DEFINE ACCESS", () => {
	test("wraps each query in parentheses", () => {
		const sql = access("user", {
			signup: "CREATE user SET email = $email",
			signin: "SELECT * FROM user WHERE email = $email",
			duration: { session: "7d" },
		}).define();

		expect(sql).toContain("TYPE RECORD");
		expect(sql).toContain("SIGNUP (CREATE user SET email = $email)");
		expect(sql).toContain("SIGNIN (SELECT * FROM user WHERE email = $email)");
		expect(sql).toContain("FOR SESSION 7d");
	});

	test("carries an authenticate clause", () => {
		expect(
			access("u", {
				signin: "SELECT 1",
				authenticate: "$auth.active",
			}).define(),
		).toContain("AUTHENTICATE ($auth.active)");
	});
});

describe("Every entity", () => {
	const entities = [
		analyzer("a", { tokenizers: ["blank"] }),
		param("p", { value: "1" }),
		storedFunction("f", { body: "RETURN 1;" }),
		sequence("s"),
		access("ac", { signin: "SELECT 1" }),
	];

	test("requests OVERWRITE rather than implying it", () => {
		for (const entity of entities) {
			expect(entity.define()).not.toContain("OVERWRITE");
			expect(entity.define({ overwrite: true })).toContain("OVERWRITE");
		}
	});

	test("emits a single terminated statement", () => {
		for (const entity of entities) {
			expect(entity.define()).toEndWith(";");
			expect(entity.remove()).toEndWith(";");
		}
	});
});
