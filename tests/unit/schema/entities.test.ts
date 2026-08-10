import { describe, expect, test } from "bun:test";
import {
	access,
	analyzer,
	config,
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

		// SurrealDB uppercases both lists, arguments included, and reports them
		// that way — declaring them in lower case would never converge
		expect(sql).toContain("DEFINE ANALYZER english_search");
		expect(sql).toContain("TOKENIZERS CLASS, CAMEL, BLANK");
		expect(sql).toContain("FILTERS LOWERCASE, ASCII, SNOWBALL(ENGLISH)");
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

describe("DEFINE ACCESS, other types", () => {
	test("JWT verifies with an algorithm and a key", () => {
		const sql = access("api", {
			type: "JWT",
			algorithm: "RS256",
			key: "public",
			issuerKey: "private",
		}).define();

		expect(sql).toContain("TYPE JWT ALGORITHM RS256");
		expect(sql).toContain("KEY 'public'");
		expect(sql).toContain("WITH ISSUER KEY 'private'");
	});

	test("JWT defaults to HS512 when no algorithm is named", () => {
		expect(access("api", { type: "JWT", key: "s" }).define()).toContain(
			"ALGORITHM HS512",
		);
	});

	test("a key set replaces the algorithm rather than joining it", () => {
		const sql = access("api", {
			type: "JWT",
			url: "https://issuer/.well-known/jwks.json",
		}).define();

		expect(sql).toContain("URL 'https://issuer/.well-known/jwks.json'");
		expect(sql).not.toContain("ALGORITHM");
	});

	test("BEARER names what a grant authenticates", () => {
		expect(access("g", { type: "BEARER", for: "USER" }).define()).toContain(
			"TYPE BEARER FOR USER",
		);
		expect(access("g", { type: "BEARER", for: "RECORD" }).define()).toContain(
			"TYPE BEARER FOR RECORD",
		);
	});

	test("BEARER emits every duration SurrealDB would fill in", () => {
		// It reports all three back, so a definition that stated none would look
		// modified on every run.
		expect(access("g", { type: "BEARER", for: "USER" }).define()).toContain(
			"DURATION FOR GRANT 4w2d, FOR TOKEN 1h, FOR SESSION NONE",
		);
	});

	test("only the types that hide a secret are opaque", () => {
		// Opaque means "created when missing, then never compared".
		expect(access("r", { signin: "SELECT 1" }).opaque).toBe(true);
		expect(access("j", { type: "JWT", key: "s" }).opaque).toBe(true);
		expect(access("u", { type: "JWT", url: "https://x" }).opaque).toBe(false);
		expect(access("b", { type: "BEARER", for: "USER" }).opaque).toBe(false);
	});
});

describe("DEFINE CONFIG", () => {
	test("GraphQL exposes everything by default", () => {
		expect(config("GRAPHQL").define()).toBe(
			"DEFINE CONFIG GRAPHQL TABLES AUTO FUNCTIONS AUTO;",
		);
	});

	test("a named list becomes INCLUDE", () => {
		expect(
			config("GRAPHQL", {
				tables: ["user", "post"],
				functions: "NONE",
			}).define(),
		).toBe("DEFINE CONFIG GRAPHQL TABLES INCLUDE user, post FUNCTIONS NONE;");
	});

	test("API carries its permissions", () => {
		expect(config("API", { permissions: "FULL" }).define()).toBe(
			"DEFINE CONFIG API PERMISSIONS FULL;",
		);
	});

	test("is keyed the way INFO FOR DB reports it, not the way it is written", () => {
		// The statement says GRAPHQL; the key is GraphQL.
		expect(config("GRAPHQL").name).toBe("GRAPHQL");
		expect(config("GRAPHQL").key).toBe("GraphQL");
		expect(config("API").key).toBe("API");
	});

	test("removes with the keyword, not the key", () => {
		expect(config("GRAPHQL").remove()).toBe("REMOVE CONFIG GRAPHQL;");
	});
});

describe("Every entity", () => {
	const entities = [
		analyzer("a", { tokenizers: ["blank"] }),
		param("p", { value: "1" }),
		storedFunction("f", { body: "RETURN 1;" }),
		sequence("s"),
		access("ac", { signin: "SELECT 1" }),
		config("GRAPHQL"),
	];

	test("requests OVERWRITE rather than implying it", () => {
		for (const entity of entities) {
			expect(entity.define()).not.toContain("OVERWRITE");
			expect(entity.define({ overwrite: true })).toContain("OVERWRITE");
		}
	});

	test("removes another name of the same kind, qualified as its own", () => {
		// The old name during a rename comes from `INFO FOR DB`, which keys a
		// function bare — but `REMOVE FUNCTION old_name;` is a parse error.
		expect(storedFunction("f", { body: "RETURN 1;" }).remove("old")).toBe(
			"REMOVE FUNCTION fn::old;",
		);
		expect(param("p", { value: "1" }).remove("old")).toBe("REMOVE PARAM $old;");
		expect(analyzer("a", { tokenizers: ["blank"] }).remove("old")).toBe(
			"REMOVE ANALYZER old;",
		);
		expect(sequence("s").remove("old")).toBe("REMOVE SEQUENCE old;");
		expect(access("ac", { signin: "SELECT 1" }).remove("old")).toBe(
			"REMOVE ACCESS old ON DATABASE;",
		);
	});

	test("emits a single terminated statement", () => {
		for (const entity of entities) {
			expect(entity.define()).toEndWith(";");
			expect(entity.remove()).toEndWith(";");
		}
	});
});
