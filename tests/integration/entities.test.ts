import { describe, expect, test } from "bun:test";
import { t, table } from "../../src";
import { diff } from "../../src/migrator/diff";
import { introspect } from "../../src/migrator/introspect";
import { migrate, plan, rollback } from "../../src/migrator/migrate";
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

	describe("an analyzer that an index uses", () => {
		// The server refuses to remove an analyzer while an index names it, so the
		// index has to move first.
		const tokenizers = ["BLANK"];
		const posts = (using: string) =>
			table("post", { body: t.string() }).index("body_ft", {
				fields: ["body"],
				fulltext: { analyzer: using },
			});

		/** The analyzer names the database has. */
		async function analyzers(): Promise<string[]> {
			const [info] =
				await db().surreal.query<[{ analyzers: Record<string, string> }]>(
					"INFO FOR DB;",
				);
			return Object.keys(info.analyzers).sort();
		}

		test("is renamed once the index has moved to the new name", async () => {
			await migrate(db().surreal, [
				analyzer("before", { tokenizers }),
				posts("before"),
			]);

			const defs = [
				analyzer("after", { tokenizers, previousNames: ["before"] }),
				posts("after"),
			];
			await migrate(db().surreal, defs);

			expect(await analyzers()).toEqual(["after"]);
			expect((await plan(db().surreal, defs)).up).toEqual([]);
		});

		test("is removed once the index has moved to another", async () => {
			await migrate(db().surreal, [
				analyzer("keep", { tokenizers }),
				analyzer("drop", { tokenizers }),
				posts("drop"),
			]);

			const defs = [analyzer("keep", { tokenizers }), posts("keep")];
			await migrate(db().surreal, defs, { removeMissing: true });

			expect(await analyzers()).toEqual(["keep"]);
			expect(
				(await plan(db().surreal, defs, { removeMissing: true })).up,
			).toEqual([]);
		});

		test("is removed once the index is gone", async () => {
			await migrate(db().surreal, [
				analyzer("keep", { tokenizers }),
				analyzer("drop", { tokenizers }),
				posts("drop"),
			]);

			const defs = [
				analyzer("keep", { tokenizers }),
				table("post", { body: t.string() }),
			];
			await migrate(db().surreal, defs, { removeMissing: true });

			expect(await analyzers()).toEqual(["keep"]);
		});

		test("is removed once the table that holds the index is gone", async () => {
			await migrate(db().surreal, [
				analyzer("keep", { tokenizers }),
				analyzer("drop", { tokenizers }),
				posts("drop"),
			]);

			await migrate(db().surreal, [analyzer("keep", { tokenizers })], {
				removeMissing: true,
			});

			expect(await analyzers()).toEqual(["keep"]);
		});

		// A rollback replays the stored `DEFINE` of whatever was changed. For an
		// index changed in place that is refused, as the index exists, so these
		// two put the index through a create or a remove instead.
		test("rolls a rename back to the old name and its index", async () => {
			const before = [
				analyzer("before", { tokenizers }),
				table("post", { body: t.string() }).index("body_ft", {
					fields: ["body"],
					fulltext: { analyzer: "before" },
				}),
			];
			await migrate(db().surreal, before);
			await migrate(db().surreal, [
				analyzer("after", { tokenizers, previousNames: ["before"] }),
				table("post", { body: t.string() }).index("body_search", {
					fields: ["body"],
					fulltext: { analyzer: "after" },
					previousNames: ["body_ft"],
				}),
			]);

			await rollback(db().surreal);

			expect(await analyzers()).toEqual(["before"]);
			expect((await plan(db().surreal, before)).up).toEqual([]);
		});

		test("rolls a removal back to the analyzer and its index", async () => {
			const before = [
				analyzer("keep", { tokenizers }),
				analyzer("drop", { tokenizers }),
				posts("drop"),
			];
			await migrate(db().surreal, before);
			await migrate(
				db().surreal,
				[analyzer("keep", { tokenizers }), table("post", { body: t.string() })],
				{ removeMissing: true },
			);

			await rollback(db().surreal);

			expect(await analyzers()).toEqual(["drop", "keep"]);
			expect((await plan(db().surreal, before)).up).toEqual([]);
		});
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
