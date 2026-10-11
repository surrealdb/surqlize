import { afterEach, describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import {
	and,
	authenticatedAs,
	edge,
	generateSchema,
	not,
	or,
	orm,
	t,
	table,
	where,
} from "../../src";
import type { Definition } from "../../src/cli/schema";
import { diff } from "../../src/migrator/diff";
import { introspect } from "../../src/migrator/introspect";
import { withTestDb } from "./setup";

const user = table("user", {
	email: t.string(),
	pass: t.string(),
	role: t.string().default("member"),
}).permissions("FOR select FULL");

const { where: asUser } = authenticatedAs(user);

const note = table("note", {
	title: t.string(),
	owner: t.record("user"),
	// A field's rule sees the row, the session, and the value being written.
	secret: t.string().permissions({
		select: where((row, { auth }) => row.owner.eq(auth.id)),
		update: where((row, { auth, value }) =>
			and(row.owner.eq(auth.id), value.ne("forbidden")),
		),
	}),
}).permissions({
	select: "full",
	create: where((_row, { auth }) => auth.id.ne(undefined)),
	update: asUser((row, { auth }) =>
		or(row.owner.eq(auth.id), auth.role.eq("admin")),
	),
	delete: "none",
});

/** Sign up (or in) as a record of the `account` access method on a new connection. */
async function connect(
	namespace: string,
	database: string,
	email: string,
): Promise<Surreal> {
	const surreal = new Surreal();
	await surreal.connect(process.env.SURREAL_URL || "ws://localhost:8000");
	await surreal.signin({
		namespace,
		database,
		access: "account",
		variables: { email, pass: "secret" },
	});
	return surreal;
}

describe("Typed permissions (integration)", () => {
	const getTestDb = withTestDb({ perTest: true });
	const sessions: Surreal[] = [];

	afterEach(async () => {
		await Promise.all(sessions.splice(0).map((s) => s.close()));
	});

	/** Apply the schema, seed two users with a note each, and sign in as both. */
	async function setup() {
		const { surreal } = getTestDb();
		const db = orm(surreal, user, note);
		await surreal.query(
			generateSchema(db)
				.statements.map((s) => s.sql)
				.join("\n"),
		);
		await surreal.query(`
			DEFINE ACCESS account ON DATABASE TYPE RECORD
				SIGNIN (SELECT * FROM user WHERE email = $email AND crypto::argon2::compare(pass, $pass))
				DURATION FOR SESSION 1h;
			CREATE user:alice SET email = 'alice', pass = crypto::argon2::generate('secret');
			CREATE user:bob SET email = 'bob', pass = crypto::argon2::generate('secret');
			CREATE user:root SET email = 'root', pass = crypto::argon2::generate('secret'), role = 'admin';
			CREATE note:a SET title = 'A', owner = user:alice, secret = 'a-secret';
			CREATE note:b SET title = 'B', owner = user:bob, secret = 'b-secret';
		`);
		const [ns, dbName] = await surreal
			.query<[string, string]>("RETURN session::ns(); RETURN session::db()")
			.then((r) => [r[0], r[1]] as const);

		const as = async (email: string) => {
			const session = await connect(ns, dbName, email);
			sessions.push(session);
			return session;
		};
		return { surreal, as };
	}

	/** Read a field as the root session, to see what a blocked write left behind. */
	async function titleOf(surreal: Surreal, id: string) {
		const [rows] = await surreal.query<[{ title: string }[]]>(
			`SELECT title FROM ${id}`,
		);
		return rows[0]?.title;
	}

	test("a record can be updated by its owner, and not by another user", async () => {
		const { surreal, as } = await setup();
		const alice = await as("alice");
		const bob = await as("bob");

		// A refused write is not an error: the row is simply not visible to it.
		await bob.query("UPDATE note:a SET title = 'taken'");
		expect(await titleOf(surreal, "note:a")).toBe("A");

		await alice.query("UPDATE note:a SET title = 'mine'");
		expect(await titleOf(surreal, "note:a")).toBe("mine");
	});

	test("a rule can name a property of auth, so an admin may update any record", async () => {
		const { surreal, as } = await setup();
		const admin = await as("root");

		await admin.query("UPDATE note:a SET title = 'by admin'");
		expect(await titleOf(surreal, "note:a")).toBe("by admin");
	});

	test("an operation set to none is refused for every session", async () => {
		const { surreal, as } = await setup();
		const alice = await as("alice");
		const admin = await as("root");

		await alice.query("DELETE note:a");
		await admin.query("DELETE note:b");

		expect(await titleOf(surreal, "note:a")).toBe("A");
		expect(await titleOf(surreal, "note:b")).toBe("B");
	});

	test("a create rule lets an authenticated session create", async () => {
		// An anonymous session cannot stand in for "not authenticated" here: a
		// server started with --unauthenticated (as the CI one is) lets it bypass
		// permissions, and a default server refuses it before any rule is read.
		// The denial of a signed-in user that fails a rule is covered above.
		const { surreal, as } = await setup();
		const alice = await as("alice");

		await alice.query(
			"CREATE note:c SET title = 'C', owner = user:alice, secret = 's'",
		);
		expect(await titleOf(surreal, "note:c")).toBe("C");
	});

	test("a field's select rule hides the value from other sessions", async () => {
		const { as } = await setup();
		const alice = await as("alice");
		const bob = await as("bob");

		const [[own]] = await alice.query<[{ secret?: string }[]]>(
			"SELECT secret FROM note:a",
		);
		const [[other]] = await bob.query<[{ secret?: string }[]]>(
			"SELECT secret FROM note:a",
		);

		expect(own?.secret).toBe("a-secret");
		expect(other?.secret).toBeUndefined();
	});

	test("a field's update rule can read the value being written", async () => {
		const { surreal, as } = await setup();
		const alice = await as("alice");

		await alice.query("UPDATE note:a SET secret = 'forbidden'");
		await alice.query("UPDATE note:a SET secret = 'allowed'");

		const [rows] = await surreal.query<[{ secret: string }[]]>(
			"SELECT secret FROM note:a",
		);
		expect(rows[0]?.secret).toBe("allowed");
	});

	test("the ORM sees the same permissions", async () => {
		const { as } = await setup();
		const bob = orm(await as("bob"), user, note);

		const titles = await bob.select("note").return((n) => n.title);
		expect(titles.sort()).toEqual(["A", "B"]);

		// A write by id is refused where the rule says so.
		await bob.update(new RecordId("note", "a")).set({ title: "taken" });
		const [a] = await bob
			.select("note")
			.where((n) => n.id.eq(new RecordId("note", "a")))
			.return((n) => n.title);
		expect(a).toBe("A");
	});
});

/**
 * A typed rule has to read back as it was written, or the migrator would
 * redefine the table on every plan.
 */
describe("Typed permissions converge (integration)", () => {
	const db = withTestDb({ perTest: true });

	async function applyTwice(definitions: Definition[]): Promise<string[]> {
		const before = await introspect(db().surreal);
		const { up } = diff(definitions, before);
		if (up.length) await db().surreal.query(up.join("\n"));

		const after = await introspect(db().surreal);
		return diff(definitions, after).up;
	}

	test("a table with a rule of every kind", async () => {
		const probe = table("probe", {
			owner: t.record("user"),
			n: t.int(),
		}).permissions({
			select: "full",
			create: where((_row, { auth }) => auth.id.ne(undefined)),
			update: where((row, { auth }) => row.owner.eq(auth.id)),
			delete: "none",
		});
		expect(await applyTwice([user, probe])).toEqual([]);
	});

	test("combined conditions", async () => {
		const probe = table("probe", {
			owner: t.record("user"),
			n: t.int(),
			title: t.string(),
		}).permissions({
			select: asUser((row, { auth }) =>
				or(row.owner.eq(auth.id), and(row.n.gt(3), row.n.lt(10))),
			),
			create: asUser((row, { auth }) =>
				and(row.owner.eq(auth.id), or(row.n.eq(1), row.n.eq(2))),
			),
			update: where((row) => not(row.title.eq("locked"))),
			delete: where((row) => row.title.eq('it\'s "quoted"')),
		});
		expect(await applyTwice([user, probe])).toEqual([]);
	});

	test("a record id, a function call and a session variable", async () => {
		const probe = table("probe", {
			owner: t.record("user"),
			title: t.string(),
		}).permissions({
			select: where((row) => row.owner.eq(new RecordId("user", "alice"))),
			create: where((row, { session }) =>
				and(row.title.len().gt(0), session.ac.eq("account")),
			),
			update: where((_row, { access }) => access.eq("account")),
		});
		expect(await applyTwice([user, probe])).toEqual([]);
	});

	test("string values of every shape", async () => {
		// SurrealDB picks the quote mark that needs the fewest escapes, so each
		// of these is stored differently from the way a naive writer would say it.
		const values = [
			"plain",
			"it's",
			'say "hi"',
			`both ' and "`,
			"back\\slash",
			'a \\" mix',
			"new\nline",
			"tab\t",
			"café ☃",
		];
		const probes = values.map((value, i) =>
			table(`literal${i}`, { title: t.string() }).permissions({
				select: where((row) => row.title.eq(value)),
			}),
		);
		expect(await applyTwice(probes)).toEqual([]);
	});

	test("a negated group", async () => {
		const probe = table("probe", { n: t.int() }).permissions({
			select: where((row) => not(or(row.n.eq(1), row.n.eq(2)))),
			create: where((row) => not(and(row.n.eq(1), row.n.eq(2)))),
			update: where((row) =>
				and(row.n.eq(0), not(or(row.n.eq(1), row.n.eq(2)))),
			),
		});
		expect(await applyTwice([probe])).toEqual([]);
	});

	test("a rule written as a string, beside a typed one", async () => {
		const probe = table("probe", { owner: t.record("user") }).permissions({
			select: "$auth.id = owner",
			update: where((row, { auth }) => row.owner.eq(auth.id)),
			create: "FULL",
		});
		expect(await applyTwice([user, probe])).toEqual([]);
	});

	test("a field with rules per operation", async () => {
		const probe = table("probe", {
			owner: t.record("user"),
			a: t.string().permissions({
				select: where((row, { auth }) => row.owner.eq(auth.id)),
				update: where((_row, { value }) => value.ne("x")),
			}),
			b: t
				.string()
				.permissions({ select: "none", create: "none", update: "none" }),
			c: t.string().permissions({ select: "full", update: "none" }),
			d: t.string().permissions({
				select: where((_row, { before, after }) => before.eq(after)),
			}),
			e: t.string().permissions("FOR select, create, update NONE"),
		});
		expect(await applyTwice([user, probe])).toEqual([]);
	});

	test("an edge", async () => {
		const wrote = edge("user", "wrote", "note", { n: t.int() }).permissions({
			select: where((row, { auth }) => row.in.eq(auth.id)),
			create: "none",
		});
		const target = table("note", { title: t.string() });
		expect(await applyTwice([user, target, wrote])).toEqual([]);
	});

	test("changing a rule is a modification, and then settles", async () => {
		const before = table("probe", { n: t.int() }).permissions({
			select: where((row) => row.n.gt(1)),
		});
		const after = table("probe", { n: t.int() }).permissions({
			select: where((row) => row.n.gt(2)),
		});
		expect(await applyTwice([before])).toEqual([]);

		const current = await introspect(db().surreal);
		const { changes } = diff([after], current);
		expect(changes.map((c) => c.kind)).toEqual(["table.modify"]);
	});
});
