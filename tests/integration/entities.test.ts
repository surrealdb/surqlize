import { describe, expect, test } from "bun:test";
import { t, table } from "../../src";
import { diff } from "../../src/migrator/diff";
import { introspect } from "../../src/migrator/introspect";
import { migrate, plan } from "../../src/migrator/migrate";
import {
	access,
	analyzer,
	param,
	sequence,
	storedFunction,
} from "../../src/schema/ddl/entities";
import { withTestDb } from "./setup";

describe("Database-level definitions", () => {
	const db = withTestDb({ perTest: true });

	test("creates each kind, and converges", async () => {
		const defs = [
			analyzer("eng", {
				tokenizers: ["BLANK", "CLASS"],
				filters: ["LOWERCASE", "ASCII"],
			}),
			param("lim", { value: "50" }),
			storedFunction("greet", {
				args: [["n", "string"]],
				returns: "string",
				body: "RETURN $n",
			}),
			sequence("order_no", { start: 100 }),
		];

		const result = await migrate(db().surreal, defs);
		expect(result?.up).toHaveLength(4);

		// The property that matters: nothing left to do on a second run
		expect((await plan(db().surreal, defs)).up).toEqual([]);
	});

	test("a sequence always states BATCH and START", async () => {
		// SurrealDB fills both in, so omitting them never converges
		const defs = [sequence("s")];
		const result = await migrate(db().surreal, defs);

		expect(result?.up[0]).toContain("BATCH 1000 START 0");
		expect((await plan(db().surreal, defs)).up).toEqual([]);
	});

	test("a function is matched by its bare name", async () => {
		// The statement says `fn::greet` but INFO FOR DB keys it as `greet`
		const defs = [storedFunction("fn::greet", { body: "RETURN 1" })];

		await migrate(db().surreal, defs);
		expect((await plan(db().surreal, defs)).up).toEqual([]);
	});

	test("changing a definition redefines it", async () => {
		await migrate(db().surreal, [param("lim", { value: "50" })]);

		const up = (await plan(db().surreal, [param("lim", { value: "100" })])).up;
		expect(up).toHaveLength(1);
		expect(up[0]).toContain("OVERWRITE");
		expect(up[0]).toContain("VALUE 100");
	});

	test("renaming redefines under the new name and drops the old", async () => {
		await migrate(db().surreal, [param("old", { value: "1" })]);

		const up = (
			await plan(db().surreal, [
				param("fresh", { value: "1", previousNames: ["old"] }),
			])
		).up;

		expect(up).toEqual(["DEFINE PARAM $fresh VALUE 1;", "REMOVE PARAM $old;"]);
	});

	test("undeclared definitions are left alone unless asked", async () => {
		await migrate(db().surreal, [param("keep", { value: "1" })]);

		expect((await plan(db().surreal, [])).up).toEqual([]);

		const current = await introspect(db().surreal);
		const { up } = diff([param("other", { value: "2" })], current, {
			removeMissing: true,
		});
		expect(up).toContain("REMOVE PARAM $keep;");
	});

	test("an analyzer can be used by a full-text index", async () => {
		const defs = [
			analyzer("eng", { tokenizers: ["BLANK"], filters: ["LOWERCASE"] }),
			table("post", { body: t.string() }).index("body_ft", {
				fields: ["body"],
				fulltext: { analyzer: "eng" },
			}),
		];

		// The analyzer has to exist before the index that names it
		await migrate(db().surreal, defs);
		expect((await plan(db().surreal, defs)).up).toEqual([]);
	});

	test("an access method is created but never re-applied", async () => {
		// SurrealDB reports the signing key as '[REDACTED]', so the stored form can
		// never match the declared one. Re-applying it would rotate the key on
		// every run.
		const defs = [
			access("account", {
				signin: "SELECT * FROM user",
				duration: { token: "15m", session: "12h" },
			}),
		];

		const result = await migrate(db().surreal, defs);
		expect(result?.up[0]).toContain("DEFINE ACCESS account");

		expect((await plan(db().surreal, defs)).up).toEqual([]);
	});
});
