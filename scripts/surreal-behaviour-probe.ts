/**
 * How SurrealDB behaves when you use what you defined.
 *
 * The companion to `surreal-probe.ts`. That one asks what the database *stores*
 * when you declare something, and compares the two strings. This one asks what
 * the database *does* when you read and write — questions with no stored form to
 * compare, so they need their own harness rather than being forced into that
 * one's declared/stored shape.
 *
 * Every behavioural claim in SURREALDB-FINDINGS.md comes from a case in this
 * file. Each states what it expected, runs it, and prints what happened.
 *
 * Same constraints as its sibling: it depends on nothing — not on Surqlize, not
 * on a test runner, not on the SurrealDB driver — and talks to the HTTP `/sql`
 * endpoint with `fetch`.
 *
 *   bun scripts/surreal-behaviour-probe.ts
 *   bun scripts/surreal-behaviour-probe.ts --endpoint http://localhost:8000 --user root --pass root
 *   bun scripts/surreal-behaviour-probe.ts --verbose
 *
 * Exit code is the number of cases whose result was not what this file records,
 * so a release that changes any of it fails rather than going quietly stale.
 */

interface Options {
	endpoint: string;
	user: string;
	pass: string;
	verbose: boolean;
}

/**
 * One behavioural question.
 *
 * `run` gets a `sql` function scoped to a throwaway database and returns what
 * happened; `holds` decides whether that is still what this file records. The
 * report prints `detail` either way, because the value is usually the point.
 */
interface Case {
	name: string;
	/** What a reasonable person would expect, stated so the gap is legible. */
	expected: string;
	run: (sql: Sql) => Promise<{ detail: string; holds: boolean }>;
}

type Sql = (statement: string) => Promise<Outcome>;

type Outcome = { ok: true; rows: unknown[] } | { ok: false; message: string };

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

const CASES: Case[] = [
	{
		name: "UPSERT on a relation writes a row graph traversal cannot see",
		expected:
			"setting in/out on a relation table produces an edge, or is refused",
		async run(sql) {
			await sql("CREATE user:a; CREATE user:b; CREATE workspace:w;");
			await sql("RELATE user:a->member_of->workspace:w SET role = 'owner';");
			await sql(
				"UPSERT member_of SET in = user:b, out = workspace:w, role = 'owner' WHERE in = user:b;",
			);

			const written = await sql("SELECT * FROM member_of WHERE in = user:b;");
			const related = await traversed(sql, "user:a");
			const upserted = await traversed(sql, "user:b");

			const rowExists =
				written.ok && (written.rows[0] as unknown[])?.length === 1;
			return {
				detail: `RELATE'd traverses to ${related}; UPSERT'd row exists=${rowExists} traverses to ${upserted}`,
				holds: rowExists && related === 1 && upserted === 0,
			};
		},
	},
	{
		name: "CREATE on a relation behaves the same way",
		expected: "same as above — an edge, or a refusal",
		async run(sql) {
			await sql("CREATE user:c; CREATE workspace:x;");
			await sql("CREATE member_of SET in = user:c, out = workspace:x;");
			const reached = await traversed(sql, "user:c");
			return { detail: `traverses to ${reached}`, holds: reached === 0 };
		},
	},
	{
		name: "RELATE is not idempotent unless the edge id is pinned",
		expected: "re-relating the same pair does not duplicate",
		async run(sql) {
			await sql("CREATE user:d; CREATE workspace:y;");
			const plain = "RELATE user:d->member_of->workspace:y SET role = 'owner';";
			await sql(plain);
			await sql(plain);
			const loose = await count(sql, "member_of WHERE in = user:d");

			const pinned =
				"RELATE user:d->member_of:pinned->workspace:y SET role = 'owner';";
			await sql(pinned);
			await sql(pinned);
			const fixed = await count(sql, "member_of WHERE id = member_of:pinned");

			return {
				detail: `bare RELATE twice → ${loose} rows; pinned id twice → ${fixed}`,
				holds: loose === 2 && fixed === 1,
			};
		},
	},
	{
		name: "type::record() is rejected mid-RELATE",
		expected:
			"the documented way to build a record id works where an edge id goes",
		async run(sql) {
			await sql("CREATE user:e; CREATE workspace:z;");
			const result = await sql(
				'RELATE user:e->type::record("member_of", "k")->workspace:z;',
			);
			return {
				detail: result.ok ? "accepted" : firstLine(result.message),
				holds: !result.ok,
			};
		},
	},
	{
		name: "A one-hop traversal yields null instead of erroring",
		expected: "projecting a field the edge lacks is an error, not null",
		async run(sql) {
			await sql(
				"CREATE customer:c; CREATE contact:p SET email = 'p@example.test'; RELATE customer:c->has_contact->contact:p;",
			);
			const one = await sql("SELECT ->has_contact.email AS e FROM customer:c;");
			const two = await sql(
				"SELECT ->has_contact->contact.email AS e FROM customer:c;",
			);
			const oneHop = JSON.stringify(first(one));
			const twoHop = JSON.stringify(first(two));
			return {
				detail: `one hop ${oneHop}, two hops ${twoHop}`,
				holds: oneHop.includes("null") && twoHop.includes("p@example.test"),
			};
		},
	},
	{
		name: ".id on a record link resolves the link rather than taking the key",
		expected: "$this.id.id is the bare key, as .id is on a RecordId in the SDK",
		async run(sql) {
			await sql("CREATE person SET name = 'Ada';");
			const dotted = await sql("SELECT VALUE { id: $this.id.id } FROM person;");
			const meta = await sql(
				"SELECT VALUE { id: meta::id($this.id) } FROM person;",
			);
			const a = JSON.stringify(first(dotted));
			const b = JSON.stringify(first(meta));
			return {
				detail: `$this.id.id → ${a}; meta::id($this.id) → ${b}`,
				holds: a.includes("person:") && !b.includes("person:"),
			};
		},
	},
	{
		name: "An all-digit key is a different record written each way",
		expected:
			"probe:123567891235 and type::record('probe','123567891235') are one record",
		async run(sql) {
			await sql(
				"CREATE type::record('digits', '123567891235'); CREATE digits:123567891235;",
			);
			const n = await count(sql, "digits");
			return { detail: `${n} rows`, holds: n === 2 };
		},
	},
	{
		name: "IN (SELECT id …) matches nothing, and the statement succeeds",
		expected: "a subquery of ids matches record links",
		async run(sql) {
			await sql(
				"CREATE acct:u1 SET email = 'a@b.c'; CREATE token:t1 SET owner = acct:u1;",
			);
			await sql(
				"DELETE token WHERE owner IN (SELECT id FROM acct WHERE email = 'a@b.c');",
			);
			const afterPlain = await count(sql, "token");
			await sql(
				"DELETE token WHERE owner IN (SELECT VALUE id FROM acct WHERE email = 'a@b.c');",
			);
			const afterValue = await count(sql, "token");
			return {
				detail: `SELECT id left ${afterPlain}; SELECT VALUE id left ${afterValue}`,
				holds: afterPlain === 1 && afterValue === 0,
			};
		},
	},
	{
		name: "A multi-statement query continues past a failing statement",
		expected: "the batch stops at the failure, or rolls back",
		async run(sql) {
			await sql(
				"DEFINE TABLE batch SCHEMAFULL; DEFINE FIELD tag ON batch TYPE string; DEFINE INDEX batch_tag ON batch FIELDS tag UNIQUE;",
			);
			await sql(
				"CREATE batch SET tag = 'first'; CREATE batch SET tag = 'first'; CREATE batch SET tag = 'third';",
			);
			const rows = await sql("SELECT VALUE tag FROM batch ORDER BY tag;");
			const tags = JSON.stringify(first(rows));
			return {
				detail: `rows after the failed batch: ${tags}`,
				holds: tags.includes("first") && tags.includes("third"),
			};
		},
	},
	{
		name: "A renamed column leaves its UNIQUE index constraining nothing",
		expected: "the index follows the rename, or the rename is refused",
		async run(sql) {
			await sql(
				"DEFINE TABLE member SCHEMAFULL; DEFINE FIELD email ON member TYPE string; DEFINE INDEX member_email ON member FIELDS email UNIQUE;",
			);
			await sql("CREATE member SET email = 'a@b.c';");
			const blocked = await sql("CREATE member SET email = 'a@b.c';");

			// A rename is REMOVE FIELD + DEFINE FIELD; there is no RENAME.
			await sql("REMOVE FIELD email ON TABLE member;");
			await sql("DEFINE FIELD email_address ON member TYPE string;");
			await sql("CREATE member SET email_address = 'x@y.z';");
			const second = await sql("CREATE member SET email_address = 'x@y.z';");

			return {
				detail: `before rename duplicate ${blocked.ok ? "ACCEPTED" : "refused"}; after rename duplicate ${second.ok ? "ACCEPTED (unconstrained)" : "refused"}`,
				holds: !blocked.ok && second.ok,
			};
		},
	},
	{
		name: "A misspelled payload key on RELATE is stored silently",
		expected: "consistent with schemaless tables, recorded for its consequence",
		async run(sql) {
			await sql("CREATE p:a; CREATE p:b;");
			await sql("RELATE p:a->follows->p:b SET rle = 'owner';");
			const rows = await sql("SELECT * FROM follows;");
			const row = JSON.stringify(first(rows));
			return {
				detail: row,
				holds: row.includes("rle") && !row.includes('"role"'),
			};
		},
	},
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** How many workspaces a user reaches through `member_of`. */
async function traversed(sql: Sql, from: string): Promise<number> {
	const result = await sql(`SELECT ->member_of->workspace AS w FROM ${from};`);
	if (!result.ok) return -1;
	const rows = result.rows[0] as { w?: unknown[] }[] | undefined;
	return rows?.[0]?.w?.length ?? 0;
}

async function count(sql: Sql, target: string): Promise<number> {
	const result = await sql(`SELECT count() FROM ${target} GROUP ALL;`);
	if (!result.ok) return -1;
	const rows = result.rows[0] as { count?: number }[] | undefined;
	return rows?.[0]?.count ?? 0;
}

function first(outcome: Outcome): unknown {
	return outcome.ok ? outcome.rows[0] : outcome.message;
}

function firstLine(message: string): string {
	return message.split("\n")[0] ?? message;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * Send SurrealQL to the HTTP endpoint.
 *
 * A parse error arrives as HTTP 400 with the message in the body; a statement
 * that parses and then fails arrives as HTTP 200 with `status: "ERR"`. Both are
 * folded into one `Outcome` here.
 */
async function query(
	options: Options,
	sql: string,
	ns: string,
	db: string,
): Promise<Outcome> {
	const response = await fetch(`${options.endpoint}/sql`, {
		method: "POST",
		headers: {
			Accept: "application/json",
			Authorization: `Basic ${btoa(`${options.user}:${options.pass}`)}`,
			"surreal-ns": ns,
			"surreal-db": db,
		},
		body: sql,
	});

	const body = (await response.json()) as
		| { status: string; result: unknown; detail?: string }[]
		| { information?: string; description?: string };

	if (!response.ok) {
		const problem = body as { information?: string; description?: string };
		return {
			ok: false,
			message: (
				problem.information ??
				problem.description ??
				`HTTP ${response.status}`
			).trim(),
		};
	}

	const statements = body as {
		status: string;
		result: unknown;
		detail?: string;
	}[];
	const failed = statements.find((s) => s.status === "ERR");
	if (failed) {
		return {
			ok: false,
			message: String(failed.detail ?? failed.result ?? "ERR").trim(),
		};
	}

	return { ok: true, rows: statements.map((s) => s.result) };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Options {
	const flag = (name: string, fallback: string) => {
		const at = argv.indexOf(`--${name}`);
		return at === -1 ? fallback : (argv[at + 1] ?? fallback);
	};

	return {
		endpoint: flag("endpoint", "http://localhost:8000"),
		user: flag("user", "root"),
		pass: flag("pass", "root"),
		verbose: argv.includes("--verbose"),
	};
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const ns = "behaviour_probe";

	console.log(`SurrealDB behaviour probes — ${options.endpoint}\n`);

	let unexpected = 0;

	for (const [index, probe] of CASES.entries()) {
		// Each case gets its own database, so one cannot see another's rows.
		const db = `case_${index}`;
		const sql: Sql = (statement) => query(options, statement, ns, db);

		await query(
			options,
			`DEFINE NAMESPACE IF NOT EXISTS ${ns}; USE NS ${ns}; DEFINE DATABASE IF NOT EXISTS ${db};`,
			ns,
			db,
		);

		let detail: string;
		let holds: boolean;
		try {
			({ detail, holds } = await probe.run(sql));
		} catch (error) {
			detail = `threw: ${(error as Error).message}`;
			holds = false;
		}

		if (!holds) unexpected += 1;

		console.log(`${holds ? "  as recorded" : "  CHANGED    "}  ${probe.name}`);
		if (options.verbose || !holds) {
			console.log(`                expected: ${probe.expected}`);
		}
		console.log(`                actual:   ${detail}\n`);
	}

	await query(options, `REMOVE NAMESPACE IF EXISTS ${ns};`, ns, ns);

	console.log(
		unexpected === 0
			? `All ${CASES.length} behaviours are as SURREALDB-FINDINGS.md records them.`
			: `${unexpected} of ${CASES.length} behaviours changed — update SURREALDB-FINDINGS.md.`,
	);

	process.exit(unexpected);
}

main().catch((error) => {
	console.error("probe run failed:", error);
	process.exit(1);
});
