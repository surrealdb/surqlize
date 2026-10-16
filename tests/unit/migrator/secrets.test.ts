import { describe, expect, test } from "bun:test";
import {
	redactSecrets,
	restoreStatement,
	unrestorableAccess,
} from "../../../src/migrator/secrets";
import { access } from "../../../src/schema/ddl/entities";

/**
 * What may be printed and recorded of an access method, and what may be
 * restored from the text the database reports.
 *
 * The keys below are the awkward ones: the statement builder writes a key with
 * `quote()`, which picks a quote style and escapes inside it, and a redaction
 * that read only the plain form would leave the rest of such a key behind.
 */

const KEYS = [
	"plain-secret-1234",
	"it's-a-secret",
	'say "hi" and it\'s fine',
	"back\\slash\\\\double",
	"ends-in-a-backslash\\",
	"KEY 'inside' KEY",
	"with spaces and ; semicolons",
	"ünï©ode-κλειδί",
];

describe("redactSecrets", () => {
	test.each(KEYS)("leaves nothing of the key %p", (key) => {
		const sql = access("jw", {
			type: "JWT",
			algorithm: "HS512",
			key,
			issuerKey: key,
		}).define();
		const shown = redactSecrets(sql);

		// The same statement with a different key shows the same thing, so
		// nothing of either survives
		const other = access("jw", {
			type: "JWT",
			algorithm: "HS512",
			key: "x",
			issuerKey: "x",
		}).define();

		expect(shown).toBe(redactSecrets(other));
		expect(shown).toBe(
			"DEFINE ACCESS jw ON DATABASE TYPE JWT ALGORITHM HS512 KEY <redacted> WITH ISSUER KEY <redacted>;",
		);
	});

	test("hides the keys of a record access that carries one", () => {
		const sql =
			"DEFINE ACCESS a ON DATABASE TYPE RECORD SIGNIN (SELECT 1) WITH JWT ALGORITHM HS512 KEY 'abc' WITH ISSUER KEY 'def' DURATION FOR TOKEN 1h;";

		expect(redactSecrets(sql)).toBe(
			"DEFINE ACCESS a ON DATABASE TYPE RECORD SIGNIN (SELECT 1) WITH JWT ALGORITHM HS512 KEY <redacted> WITH ISSUER KEY <redacted> DURATION FOR TOKEN 1h;",
		);
	});

	test("reads KEY in either case", () => {
		expect(
			redactSecrets("DEFINE ACCESS a ON DATABASE TYPE JWT key 'abc';"),
		).toBe("DEFINE ACCESS a ON DATABASE TYPE JWT key <redacted>;");
	});

	test("takes a key as it is written without a space", () => {
		expect(
			redactSecrets("DEFINE ACCESS a ON DATABASE TYPE JWT KEY'abc';"),
		).toBe("DEFINE ACCESS a ON DATABASE TYPE JWT KEY<redacted>;");
	});

	test("does not mistake the word KEY inside a query for a clause", () => {
		const sql = access("a", {
			signin: "SELECT * FROM user WHERE note = 'KEY ' AND other = 'KEY'",
			authenticate: "$auth.note = \"KEY 'x'\"",
		}).define();

		expect(redactSecrets(sql)).toBe(sql);
	});

	test("hides a key that follows such a query", () => {
		const sql =
			"DEFINE ACCESS a ON DATABASE TYPE RECORD SIGNIN (SELECT * FROM user WHERE note = 'KEY ') WITH JWT ALGORITHM HS512 KEY 'abc';";

		expect(redactSecrets(sql)).toBe(
			"DEFINE ACCESS a ON DATABASE TYPE RECORD SIGNIN (SELECT * FROM user WHERE note = 'KEY ') WITH JWT ALGORITHM HS512 KEY <redacted>;",
		);
	});

	test("leaves an access that holds no key as it is", () => {
		for (const options of [
			{ type: "JWT", url: "https://issuer/jwks" },
			{ type: "BEARER", for: "USER" },
		] as const) {
			const sql = access("a", options).define();
			expect(redactSecrets(sql)).toBe(sql);
		}
	});

	test("leaves other statements alone, even ones that say KEY", () => {
		for (const sql of [
			"DEFINE TABLE user TYPE NORMAL SCHEMAFULL;",
			"DEFINE FIELD note ON user TYPE string DEFAULT 'KEY secret';",
			"REMOVE ACCESS a ON DATABASE;",
		]) {
			expect(redactSecrets(sql)).toBe(sql);
		}
	});

	test("is not valid SurrealQL, so printed text cannot be run by accident", () => {
		expect(
			redactSecrets(access("a", { type: "JWT", key: "k" }).define()),
		).toMatch(/KEY <redacted>/);
	});
});

describe("restoreStatement", () => {
	test("restores an ordinary definition from the text the database reports", () => {
		const reported =
			"DEFINE ACCESS a ON DATABASE TYPE BEARER FOR USER DURATION FOR GRANT 4w2d, FOR TOKEN 1h, FOR SESSION NONE";

		expect(restoreStatement(reported)).toBe(`${reported};`);
	});

	test("does not write a statement that sets the key to the reported text", () => {
		const reported =
			"DEFINE ACCESS jw ON DATABASE TYPE JWT ALGORITHM HS512 KEY '[REDACTED]' WITH ISSUER KEY '[REDACTED]' DURATION FOR TOKEN 1h, FOR SESSION NONE";

		const written = restoreStatement(reported);

		expect(written.startsWith("--")).toBe(true);
		expect(written).not.toContain("DEFINE");
		expect(written).not.toContain("[REDACTED]");
		expect(written).toContain("jw");
	});

	test("takes the name of an access whose name needs escaping", () => {
		const reported =
			"DEFINE ACCESS `my-access` ON DATABASE TYPE JWT ALGORITHM HS512 KEY '[REDACTED]'";

		expect(unrestorableAccess([restoreStatement(reported)])).toBe(
			"`my-access`",
		);
	});

	test("takes the whole name of an access whose escaped name holds a space", () => {
		const reported =
			"DEFINE ACCESS `my access` ON DATABASE TYPE JWT ALGORITHM HS512 KEY '[REDACTED]'";

		const written = restoreStatement(reported);

		expect(written).toBe(
			"-- cannot restore access `my access`: its keys are not readable from the database",
		);
		expect(unrestorableAccess([written])).toBe("`my access`");
	});

	test("takes a name whole in each way it can be escaped", () => {
		for (const name of [
			"`my access`",
			"⟨my access⟩",
			"`a\\`b c`",
			"`a: b`",
			"`a ⟩ b`",
		]) {
			const reported = `DEFINE ACCESS ${name} ON DATABASE TYPE JWT ALGORITHM HS512 KEY '[REDACTED]'`;

			expect(unrestorableAccess([restoreStatement(reported)])).toBe(name);
			expect(unrestorableAccess([`${reported};`])).toBe(name);
			expect(
				unrestorableAccess([
					reported.replace("ACCESS", "ACCESS OVERWRITE"),
					"REMOVE TABLE a;",
				]),
			).toBe(name);
		}
	});

	test("a key that merely looks like the reported text but is not it is restored", () => {
		const reported =
			"DEFINE ACCESS a ON DATABASE TYPE JWT ALGORITHM HS512 KEY '[REDACTED] too'";

		expect(restoreStatement(reported)).toBe(`${reported};`);
	});
});

describe("unrestorableAccess", () => {
	test("finds the note a rollback leaves", () => {
		const note = restoreStatement(
			"DEFINE ACCESS jw ON DATABASE TYPE JWT KEY '[REDACTED]'",
		);

		expect(unrestorableAccess(["REMOVE TABLE a;", note])).toBe("jw");
	});

	test("finds a statement written before notes, which replays the reported text", () => {
		expect(
			unrestorableAccess([
				"DEFINE ACCESS OVERWRITE jw ON DATABASE TYPE JWT ALGORITHM HS512 KEY '[REDACTED]' WITH ISSUER KEY '[REDACTED]';",
			]),
		).toBe("jw");
	});

	test("finds one in double quotes", () => {
		expect(
			unrestorableAccess([
				'DEFINE ACCESS jw ON DATABASE TYPE JWT ALGORITHM HS512 KEY "[REDACTED]";',
			]),
		).toBe("jw");
	});

	test("finds nothing in an ordinary history", () => {
		expect(
			unrestorableAccess([
				"REMOVE ACCESS jw ON DATABASE;",
				"DEFINE TABLE user TYPE NORMAL SCHEMAFULL;",
				"DEFINE FIELD note ON user TYPE string DEFAULT '[REDACTED]';",
			]),
		).toBeUndefined();
	});

	test("finds nothing in an access whose key is its own", () => {
		expect(
			unrestorableAccess([
				"DEFINE ACCESS jw ON DATABASE TYPE JWT ALGORITHM HS512 KEY 'real-key';",
			]),
		).toBeUndefined();
	});
});
