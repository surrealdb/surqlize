import { afterAll, describe, expect, test } from "bun:test";
import { Surreal, Uuid } from "surrealdb";
import { __type, orm, session, table, where } from "../../src";
import { defineTable } from "../../src/schema/ddl/define";
import type { AbstractType } from "../../src/types";
import { atLeast, serverVersion } from "../helpers/db";
import { withTestDb } from "./setup";

/**
 * The types a rule gives `$session`, and the types the `session::` functions
 * return, checked against what a real session holds.
 *
 * Three kinds of session are read, so that both sides of every optional field
 * are seen: a system user in a database, a record user in the same one, and a
 * system user who has selected no namespace or database.
 */

const URL_ = process.env.SURREAL_URL || "ws://localhost:8000";

// What a session holds was observed on 3.2.3, so this runs from there.
const observed = atLeast(await serverVersion(), 3, 2);

/** The `session::` functions, by the name each is called. */
const FUNCTIONS = [
	"ac",
	"db",
	"id",
	"ip",
	"ns",
	"origin",
	"rd",
	"token",
] as const;

/** What one session holds: its `$session`, and what each function returns. */
interface Read {
	value: Record<string, unknown>;
	functions: Record<string, unknown>;
}

/** A workable to build the functions against: only their types are read. */
const source = orm(new Surreal()).value(1);

/** The type a rule is rendered with for `$session`, taken from a rule as it runs. */
function declaredSession(): AbstractType {
	let captured: { [__type]: AbstractType } | undefined;

	const rules = table("rules", {}).permissions({
		select: where((_row, { session }) => {
			captured = session as unknown as { [__type]: AbstractType };
			return session.ac.eq("x");
		}),
	});
	// A rule runs when the schema is rendered
	defineTable(rules);

	if (!captured) throw new Error("The rule did not run");
	return captured[__type];
}

describe.skipIf(!observed)(
	"$session and the session functions against a live server",
	() => {
		const getTestDb = withTestDb({
			setup: async ({ surreal }) => {
				await surreal.query(`
				DEFINE TABLE user SCHEMALESS PERMISSIONS FULL;
				DEFINE ACCESS account ON DATABASE TYPE RECORD
					SIGNIN (SELECT * FROM user WHERE email = $email)
					DURATION FOR SESSION 1h;
				CREATE user:alice SET email = 'alice';
			`);
			},
		});

		const open: Surreal[] = [];
		afterAll(async () => {
			await Promise.all(open.map((s) => s.close()));
		});

		/** A new connection, signed in by `signin`. */
		async function connect(
			signin: (surreal: Surreal) => Promise<unknown>,
		): Promise<Surreal> {
			const surreal = new Surreal();
			await surreal.connect(URL_);
			await signin(surreal);
			open.push(surreal);
			return surreal;
		}

		/** The system user of the test, which is already in the database. */
		const asSystemUser = () => getTestDb().surreal;

		/** Alice, signed in through the access method. */
		async function asRecordUser(): Promise<Surreal> {
			const [namespace, database] = await asSystemUser()
				.query<[string, string]>("RETURN session::ns(); RETURN session::db()")
				.then((r) => [r[0], r[1]] as const);

			return connect((surreal) =>
				surreal.signin({
					namespace,
					database,
					access: "account",
					variables: { email: "alice" },
				}),
			);
		}

		/** The system user, with no namespace or database selected. */
		const asBareUser = () =>
			connect((surreal) =>
				surreal.signin({ username: "root", password: "root" }),
			);

		/** Read `$session` and every `session::` function, in one session. */
		async function read(connection: Surreal): Promise<Read> {
			const [value] =
				await connection.query<[Record<string, unknown>]>("RETURN $session;");

			const functions: Record<string, unknown> = {};
			for (const name of FUNCTIONS) {
				[functions[name]] = await connection.query<[unknown]>(
					`RETURN session::${name}();`,
				);
			}

			return { value, functions };
		}

		/** Every value is what its declared type says it is. */
		function expectDeclared(result: Read) {
			expect(declaredSession().validate(result.value)).toBe(true);

			for (const name of FUNCTIONS) {
				const type = session[name](source)[__type];
				expect(type.validate(result.functions[name]), name).toBe(true);
			}
		}

		test("a system user in a database", async () => {
			const result = await read(asSystemUser());
			expectDeclared(result);

			expect(result.value.id).toBeInstanceOf(Uuid);
			expect(result.functions.id).toBeInstanceOf(Uuid);
			// No access method, no record and no session duration: absent, not empty
			expect(result.functions.ac).toBeUndefined();
			expect(result.functions.rd).toBeUndefined();
			expect(result.value.exp).toBeUndefined();
			// What it signed in with
			expect(result.functions.token).toBeObject();
			expect(result.value.tk).toBeObject();
		});

		test("a record user", async () => {
			const result = await read(await asRecordUser());
			expectDeclared(result);

			expect(result.value.id).toBeInstanceOf(Uuid);
			expect(result.functions.id).toBeInstanceOf(Uuid);
			expect(result.functions.ac).toBe("account");
			expect(String(result.functions.rd)).toBe("user:alice");
			expect(Number.isInteger(result.value.exp)).toBe(true);
			expect(result.functions.token).toBeObject();
			expect(result.value.tk).toBeObject();
		});

		test("a system user with no namespace or database selected", async () => {
			const result = await read(await asBareUser());
			expectDeclared(result);

			// Absent until one is selected
			expect(result.functions.ns).toBeUndefined();
			expect(result.functions.db).toBeUndefined();
			expect(result.value.ns).toBeUndefined();
			expect(result.value.db).toBeUndefined();
		});
	},
);
