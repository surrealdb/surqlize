/**
 * What SurrealDB stores when you define something.
 *
 * Every claim in SURREALDB-FINDINGS.md comes from a probe in this file. Each one
 * runs a `DEFINE`, reads the definition back with `INFO`, and prints the two side
 * by side. Anything that comes back changed is a thing a migration tool has to
 * account for, because it has to decide whether a schema still matches a
 * database by comparing those two strings.
 *
 * It depends on nothing — not on Surqlize, not on a test runner, not even on the
 * SurrealDB driver. It talks to the HTTP `/sql` endpoint with `fetch`, so it can
 * be dropped into any checkout and run against any server.
 *
 *   bun scripts/surreal-probe.ts
 *   bun scripts/surreal-probe.ts --endpoint http://localhost:8000 --user root --pass root
 *   bun scripts/surreal-probe.ts --group types --verbose
 *
 * Exit code is the number of probes whose result was not what this file records,
 * so a later SurrealDB release that changes any of this shows up as a failure
 * rather than as silently stale documentation.
 */

interface Options {
	endpoint: string;
	user: string;
	pass: string;
	group?: string;
	verbose: boolean;
}

/**
 * One thing to find out.
 *
 * `declared` is run, then the definition named by `find` is read back. `note`
 * says what the probe is for, and appears in the report next to the result.
 */
interface Probe {
	group: string;
	note: string;
	/** Statements to run before the one being measured. */
	setup?: string[];
	declared: string;
	/** Where to look for the stored form. */
	find:
		| { in: "field" | "index" | "event"; table: string; name: string }
		| { in: "table"; name: string }
		| { in: "db"; bucket: string; name: string };
	/** What this file records happening today, so a change is visible. */
	expect: "same" | "differs" | "error";
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

const T = "probe";

/** A field probe, since most of them are. */
function field(
	group: string,
	note: string,
	name: string,
	rest: string,
	expect: Probe["expect"] = "differs",
	setup: string[] = [],
): Probe {
	return {
		group,
		note,
		setup,
		declared: `DEFINE FIELD ${name} ON TABLE ${T} ${rest}`,
		find: { in: "field", table: T, name },
		expect,
	};
}

const PROBES: Probe[] = [
	// -- Types ---------------------------------------------------------------
	field(
		"types",
		"option is rewritten as a union with none",
		"f_opt",
		"TYPE option<string>",
	),
	field(
		"types",
		"the rewrite reaches every level of nesting",
		"f_deep",
		"TYPE option<array<option<record<u>>>>",
	),
	field("types", "a plain scalar survives", "f_str", "TYPE string"),
	field("types", "numeric widths survive", "f_int", "TYPE int"),
	field(
		"types",
		"a bounded collection survives",
		"f_cap",
		"TYPE array<string, 10>",
	),
	field(
		"types",
		"a lower bound is rejected outright",
		"f_two",
		"TYPE array<string, 1, 10>",
		"error",
	),
	field(
		"types",
		"range takes no element type",
		"f_range",
		"TYPE range<datetime>",
		"error",
	),
	field(
		"types",
		"FLEXIBLE has to follow the type",
		"f_flex_bad",
		"FLEXIBLE TYPE object",
		"error",
	),
	field(
		"types",
		"FLEXIBLE after the type is accepted",
		"f_flex",
		"TYPE object FLEXIBLE",
	),

	// -- Defaults ------------------------------------------------------------
	field(
		"defaults",
		"an integer default survives",
		"d_int",
		"TYPE int DEFAULT 5",
	),
	field(
		"defaults",
		"a non-integer default gains an f suffix, whatever the field's type",
		"d_dec",
		"TYPE decimal DEFAULT 1.5",
	),
	field(
		"defaults",
		"a float default gains it too",
		"d_float",
		"TYPE float DEFAULT 3.14",
	),
	field(
		"defaults",
		"a plain string default survives",
		"d_str",
		"TYPE string DEFAULT 'draft'",
	),
	field(
		"defaults",
		"a double-quoted string is re-quoted to single",
		"d_dq",
		'TYPE string DEFAULT "draft"',
	),
	field(
		"defaults",
		"a value holding an apostrophe is re-quoted to double instead",
		"d_apos",
		"TYPE string DEFAULT 'it\\'s'",
	),
	field(
		"defaults",
		"an empty object default gains spaces",
		"d_obj",
		"TYPE object DEFAULT {}",
	),
	field(
		"defaults",
		"time:: is left alone",
		"d_time",
		"TYPE datetime DEFAULT time::now()",
	),
	field(
		"defaults",
		"rand:: is backticked — the same syntax, quoted in one namespace and not another",
		"d_rand",
		"TYPE uuid DEFAULT rand::uuid::v7()",
	),
	field(
		"defaults",
		"string:: is left alone too",
		"d_upper",
		"TYPE string DEFAULT string::uppercase('a')",
	),

	// -- Clauses -------------------------------------------------------------
	field(
		"clauses",
		"ON TABLE is stored as ON",
		"c_on",
		"TYPE string",
		"differs",
	),
	field(
		"clauses",
		"redundant parentheses in an assert are dropped",
		"c_assert",
		"TYPE int ASSERT ($value >= 0) AND ($value <= 10)",
	),
	field(
		"clauses",
		"a field gains PERMISSIONS FULL it never asked for",
		"c_perm_none",
		"TYPE string",
	),
	field(
		"clauses",
		"naming one field permission leaves the rest FULL",
		"c_perm_one",
		"TYPE string PERMISSIONS FOR select WHERE published = true",
	),
	field(
		"clauses",
		"a field cannot carry a delete permission at all",
		"c_perm_del",
		"TYPE string PERMISSIONS FOR delete NONE",
		"error",
	),
	field(
		"clauses",
		"a literal union is re-quoted to single quotes",
		"c_lit",
		`TYPE "a" | "b" | "c"`,
	),
	field(
		"clauses",
		"newlines inside a block are collapsed",
		"c_nl",
		"TYPE int VALUE {\n  LET $x = 1;\n  RETURN $x;\n}",
	),
	field(
		"clauses",
		"a deferred value is stored parenthesised",
		"c_value",
		"TYPE int VALUE { 1 + 1 }",
	),

	// -- Tables --------------------------------------------------------------
	{
		group: "tables",
		note: "a table gains TYPE ANY and PERMISSIONS NONE it never asked for",
		declared: "DEFINE TABLE t_bare SCHEMAFULL",
		find: { in: "table", name: "t_bare" },
		expect: "differs",
	},
	{
		group: "tables",
		note: "naming one table permission leaves the rest NONE — the opposite of a field",
		declared:
			"DEFINE TABLE t_perm TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select FULL",
		find: { in: "table", name: "t_perm" },
		expect: "differs",
	},
	{
		group: "tables",
		note: "a changefeed duration is decomposed",
		declared: "DEFINE TABLE t_cf TYPE NORMAL SCHEMAFULL CHANGEFEED 7d",
		find: { in: "table", name: "t_cf" },
		expect: "differs",
	},
	{
		group: "tables",
		note: "redefining an existing table is an error rather than a replacement",
		setup: ["DEFINE TABLE t_twice TYPE NORMAL SCHEMAFULL"],
		declared: "DEFINE TABLE t_twice TYPE NORMAL SCHEMAFULL",
		find: { in: "table", name: "t_twice" },
		expect: "error",
	},

	// -- Indexes -------------------------------------------------------------
	{
		group: "indexes",
		note: "a plain index survives",
		setup: [`DEFINE FIELD ix_a ON TABLE ${T} TYPE string`],
		declared: `DEFINE INDEX i_plain ON TABLE ${T} FIELDS ix_a`,
		find: { in: "index", table: T, name: "i_plain" },
		expect: "differs",
	},
	{
		group: "indexes",
		note: "CONCURRENTLY is accepted and then forgotten",
		setup: [`DEFINE FIELD ix_a ON TABLE ${T} TYPE string`],
		declared: `DEFINE INDEX i_conc ON TABLE ${T} FIELDS ix_a CONCURRENTLY`,
		find: { in: "index", table: T, name: "i_conc" },
		expect: "differs",
	},
	{
		group: "indexes",
		note: "a full-text index gains an analyzer and a BM25 clause",
		setup: [`DEFINE FIELD ix_a ON TABLE ${T} TYPE string`],
		declared: `DEFINE INDEX i_ft ON TABLE ${T} FIELDS ix_a FULLTEXT`,
		find: { in: "index", table: T, name: "i_ft" },
		expect: "differs",
	},
	{
		group: "indexes",
		note: "full-text over two columns is rejected",
		setup: [
			`DEFINE FIELD ix_a ON TABLE ${T} TYPE string`,
			`DEFINE FIELD ix_b ON TABLE ${T} TYPE string`,
		],
		declared: `DEFINE INDEX i_ft2 ON TABLE ${T} FIELDS ix_a, ix_b FULLTEXT`,
		find: { in: "index", table: T, name: "i_ft2" },
		expect: "error",
	},
	{
		group: "indexes",
		note: "HNSW fills in every tuning parameter, including a long float",
		setup: [`DEFINE FIELD ix_v ON TABLE ${T} TYPE array<float>`],
		declared: `DEFINE INDEX i_hnsw ON TABLE ${T} FIELDS ix_v HNSW DIMENSION 3 DIST COSINE`,
		find: { in: "index", table: T, name: "i_hnsw" },
		expect: "differs",
	},
	{
		group: "indexes",
		note: "a COUNT index rejects the columns every other index requires",
		setup: [`DEFINE FIELD ix_a ON TABLE ${T} TYPE string`],
		declared: `DEFINE INDEX i_count ON TABLE ${T} FIELDS ix_a COUNT`,
		find: { in: "index", table: T, name: "i_count" },
		expect: "error",
	},
	{
		group: "indexes",
		note: "MTREE is gone",
		setup: [`DEFINE FIELD ix_v ON TABLE ${T} TYPE array<float>`],
		declared: `DEFINE INDEX i_mtree ON TABLE ${T} FIELDS ix_v MTREE DIMENSION 3`,
		find: { in: "index", table: T, name: "i_mtree" },
		expect: "error",
	},

	// -- Events --------------------------------------------------------------
	{
		group: "events",
		note: "a RETURN body is left alone",
		declared: `DEFINE EVENT e_ret ON TABLE ${T} WHEN $event = "CREATE" THEN RETURN 1`,
		find: { in: "event", table: T, name: "e_ret" },
		expect: "differs",
	},
	{
		group: "events",
		note: "an UPDATE body is parenthesised — the wrapping depends on the statement",
		declared: `DEFINE EVENT e_upd ON TABLE ${T} WHEN $event = "CREATE" THEN UPDATE ${T} SET x = 1`,
		find: { in: "event", table: T, name: "e_upd" },
		expect: "differs",
	},
	{
		group: "events",
		note: "an event block keeps its semicolons, unlike a function body",
		declared: `DEFINE EVENT e_block ON TABLE ${T} WHEN $event = "CREATE" THEN { LET $x = 1; RETURN $x; }`,
		find: { in: "event", table: T, name: "e_block" },
		expect: "differs",
	},
	{
		group: "events",
		note: "parentheses around the condition are dropped",
		declared: `DEFINE EVENT e_paren ON TABLE ${T} WHEN $event = "CREATE" AND (1 = 1) THEN RETURN 1`,
		find: { in: "event", table: T, name: "e_paren" },
		expect: "differs",
	},
	{
		group: "events",
		note: "an event that can never fire is accepted without complaint",
		declared: `DEFINE EVENT e_null ON TABLE ${T} WHEN NULL THEN RETURN 1`,
		find: { in: "event", table: T, name: "e_null" },
		expect: "differs",
	},

	// -- Database-level definitions -----------------------------------------
	{
		group: "entities",
		note: "analyzer tokenizers and filters are uppercased, arguments included",
		declared:
			"DEFINE ANALYZER an_up TOKENIZERS blank, class FILTERS lowercase, snowball(english)",
		find: { in: "db", bucket: "analyzers", name: "an_up" },
		expect: "differs",
	},
	{
		group: "entities",
		note: "a function body loses the semicolon before its closing brace",
		declared: "DEFINE FUNCTION fn::fn_semi($n: int) -> int { RETURN $n * 2; }",
		find: { in: "db", bucket: "functions", name: "fn_semi" },
		expect: "differs",
	},
	{
		group: "entities",
		note: "a function is keyed bare although REMOVE needs the fn:: prefix",
		declared: "DEFINE FUNCTION fn::fn_key() { RETURN 1 }",
		find: { in: "db", bucket: "functions", name: "fn_key" },
		expect: "differs",
	},
	{
		group: "entities",
		note: "a sequence gains a batch and a start it never asked for",
		declared: "DEFINE SEQUENCE sq_bare",
		find: { in: "db", bucket: "sequences", name: "sq_bare" },
		expect: "differs",
	},
	{
		group: "entities",
		note: "a bearer grant duration is decomposed",
		declared:
			"DEFINE ACCESS ac_bear ON DATABASE TYPE BEARER FOR USER DURATION FOR GRANT 30d",
		find: { in: "db", bucket: "accesses", name: "ac_bear" },
		expect: "differs",
	},
	{
		group: "entities",
		note: "a record access has its signing key redacted, so it can never be compared",
		declared:
			"DEFINE ACCESS ac_rec ON DATABASE TYPE RECORD SIGNIN (SELECT * FROM u)",
		find: { in: "db", bucket: "accesses", name: "ac_rec" },
		expect: "differs",
	},
	{
		group: "entities",
		note: "a config is stored without the keyword that defines it",
		declared: "DEFINE CONFIG GRAPHQL TABLES AUTO FUNCTIONS AUTO",
		find: { in: "db", bucket: "configs", name: "GraphQL" },
		expect: "differs",
	},

	// -- Hazards -------------------------------------------------------------
	{
		group: "hazards",
		note: "a dropped field leaves its index behind, still UNIQUE, indexing nothing",
		setup: [
			`DEFINE FIELD h_email ON TABLE ${T} TYPE string`,
			`DEFINE INDEX h_uq ON TABLE ${T} FIELDS h_email UNIQUE`,
		],
		declared: `REMOVE FIELD h_email ON TABLE ${T}`,
		// The point is what survives the removal, not the removal itself.
		find: { in: "index", table: T, name: "h_uq" },
		expect: "differs",
	},
	{
		group: "hazards",
		note: "ALTER … DEFAULT NONE stores a literal instead of clearing the default",
		setup: [`DEFINE FIELD h_def ON TABLE ${T} TYPE option<int> DEFAULT 5`],
		declared: `ALTER FIELD h_def ON TABLE ${T} DEFAULT NONE`,
		find: { in: "field", table: T, name: "h_def" },
		expect: "differs",
	},
	{
		group: "hazards",
		note: "DROP DEFAULT is the form that actually clears it",
		setup: [`DEFINE FIELD h_drop ON TABLE ${T} TYPE option<int> DEFAULT 5`],
		declared: `ALTER FIELD h_drop ON TABLE ${T} DROP DEFAULT`,
		find: { in: "field", table: T, name: "h_drop" },
		expect: "differs",
	},

	// -- Grammar -------------------------------------------------------------
	{
		group: "grammar",
		note: "there is no RENAME",
		setup: [`DEFINE FIELD r_old ON TABLE ${T} TYPE string`],
		declared: `ALTER FIELD r_old ON TABLE ${T} RENAME TO r_new`,
		find: { in: "field", table: T, name: "r_old" },
		expect: "error",
	},
	{
		group: "grammar",
		note: "ON DELETE does not take the SQL spellings",
		declared: `DEFINE FIELD g_del ON TABLE ${T} TYPE record<u> REFERENCE ON DELETE SET NULL`,
		find: { in: "field", table: T, name: "g_del" },
		expect: "error",
	},
	{
		group: "grammar",
		note: "ALTER TABLE has no DROP, though DROP is a table option",
		setup: ["DEFINE TABLE t_alter TYPE NORMAL SCHEMAFULL"],
		declared: "ALTER TABLE t_alter DROP",
		find: { in: "table", name: "t_alter" },
		expect: "error",
	},
	field(
		"grammar",
		"id cannot be a record link, though every row's id is one",
		"id",
		"TYPE record<probe>",
		"error",
	),
];

// ---------------------------------------------------------------------------
// Running them
// ---------------------------------------------------------------------------

interface Result {
	probe: Probe;
	stored: string | null;
	error: string | null;
	outcome: "same" | "differs" | "error";
	/** Differs only by the two rewrites that apply to every definition. */
	cosmetic: boolean;
}

/** One statement's outcome, however SurrealDB chose to report it. */
type QueryResult =
	| { ok: true; results: { status: string; result: unknown }[] }
	| { ok: false; message: string };

/**
 * Send SurrealQL to the HTTP endpoint.
 *
 * The two kinds of failure arrive by different routes, which is itself worth
 * knowing: a parse error comes back as HTTP 400 with the message in the body,
 * while a statement that parses and then fails comes back as HTTP 200 with
 * `status: "ERR"`. A client has to handle both to report either.
 */
async function query(
	options: Options,
	sql: string,
	ns?: string,
	db?: string,
): Promise<QueryResult> {
	const headers: Record<string, string> = {
		Accept: "application/json",
		Authorization: `Basic ${btoa(`${options.user}:${options.pass}`)}`,
	};
	if (ns) headers["surreal-ns"] = ns;
	if (db) headers["surreal-db"] = db;

	const response = await fetch(`${options.endpoint}/sql`, {
		method: "POST",
		headers,
		body: sql,
	});

	const body = (await response.json()) as
		| { status: string; result: unknown }[]
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

	return { ok: true, results: body as { status: string; result: unknown }[] };
}

/** Pull the stored definition out of an `INFO` result. */
function locate(info: unknown, find: Probe["find"]): string | null {
	const root = info as Record<string, Record<string, string>>;

	if (find.in === "table") return root.tables?.[find.name] ?? null;
	if (find.in === "db") return root[find.bucket]?.[find.name] ?? null;

	const bucket = { field: "fields", index: "indexes", event: "events" }[
		find.in
	];
	return root[bucket]?.[find.name] ?? null;
}

/** Compare ignoring only the trailing semicolon, which is punctuation. */
function isSame(declared: string, stored: string): boolean {
	return declared.trim().replace(/;$/, "") === stored.trim().replace(/;$/, "");
}

/**
 * Compare again, having forgiven the two rewrites that apply to everything.
 *
 * `ON TABLE t` becoming `ON t`, and a `PERMISSIONS` clause being appended, are
 * each a single rule to write once. Counting them would overstate the case, so
 * this measures what is left after allowing for both — the differences that
 * need a rule of their own.
 */
function isSameAllowingUniversal(declared: string, stored: string): boolean {
	const forgive = (text: string): string =>
		text
			.trim()
			.replace(/;$/, "")
			.replace(/\bON\s+TABLE\s+/i, "ON ")
			.replace(/\s+PERMISSIONS\s+(FULL|NONE)$/i, "")
			.replace(/\s+PERMISSIONS\s+FOR\s.*$/i, "");

	return forgive(declared) === forgive(stored);
}

/** Run the statement being measured; return the failure, if there was one. */
async function apply(
	options: Options,
	declared: string,
	ns: string,
): Promise<string | null> {
	const applied = await query(options, `${declared};`, ns, ns);

	if (!applied.ok) return applied.message;
	if (applied.results[0]?.status !== "OK") {
		return String(applied.results[0]?.result ?? "unknown error");
	}

	return null;
}

/** Read the definition back out of `INFO`. */
async function readBack(
	options: Options,
	probe: Probe,
	ns: string,
): Promise<string | null> {
	const scope =
		probe.find.in === "db" || probe.find.in === "table"
			? "INFO FOR DB;"
			: `INFO FOR TABLE ${probe.find.table};`;

	const info = await query(options, scope, ns, ns);
	return info.ok ? locate(info.results[0]?.result, probe.find) : null;
}

async function runProbe(
	options: Options,
	probe: Probe,
	index: number,
): Promise<Result> {
	// A namespace each, so one probe cannot see another's leftovers.
	const ns = `probe_${Date.now()}_${index}`;
	await query(
		options,
		`DEFINE NAMESPACE ${ns}; USE NS ${ns}; DEFINE DATABASE ${ns};`,
	);
	await query(options, `DEFINE TABLE ${T} SCHEMAFULL;`, ns, ns);

	for (const statement of probe.setup ?? []) {
		await query(options, `${statement};`, ns, ns);
	}

	const error = await apply(options, probe.declared, ns);
	const stored = error ? null : await readBack(options, probe, ns);

	await query(options, `REMOVE NAMESPACE ${ns};`);

	const outcome: Result["outcome"] = error
		? "error"
		: stored !== null && isSame(probe.declared, stored)
			? "same"
			: "differs";

	const cosmetic =
		outcome === "differs" &&
		stored !== null &&
		isSameAllowingUniversal(probe.declared, stored);

	return { probe, stored, error, outcome, cosmetic };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const MARK = { same: "  same  ", differs: "DIFFERS ", error: " ERROR  " };

/** How the run went, in the two measures that matter. */
function tally(results: Result[]): {
	same: number;
	differs: number;
	error: number;
	substantive: number;
} {
	return {
		same: results.filter((r) => r.outcome === "same").length,
		differs: results.filter((r) => r.outcome === "differs").length,
		error: results.filter((r) => r.outcome === "error").length,
		substantive: results.filter((r) => r.outcome === "differs" && !r.cosmetic)
			.length,
	};
}

/** Print one probe, showing the detail only where there is something to see. */
function line(result: Result, verbose: boolean): void {
	const surprising = result.outcome !== result.probe.expect;

	console.log(
		`[${MARK[result.outcome]}] ${result.probe.note}${surprising ? "   << CHANGED" : ""}`,
	);

	if (result.outcome === "error") {
		console.log(`      declared  ${result.probe.declared}`);
		console.log(`      refused   ${(result.error ?? "").split("\n")[0]}`);
	} else if (result.outcome === "differs" || verbose) {
		console.log(`      declared  ${result.probe.declared}`);
		console.log(`      stored    ${result.stored}`);
	}
}

function report(results: Result[], options: Options): number {
	let group = "";
	let unexpected = 0;

	for (const result of results) {
		if (result.probe.group !== group) {
			group = result.probe.group;
			console.log(`
${"─".repeat(78)}
${group.toUpperCase()}
`);
		}

		if (result.outcome !== result.probe.expect) unexpected += 1;
		line(result, options.verbose);
	}

	const counts = tally(results);

	console.log(`\n${"─".repeat(78)}`);
	console.log(
		`${results.length} probes: ${counts.same} round-trip, ${counts.differs} come back changed, ${counts.error} refused`,
	);
	console.log(
		`Of the ${counts.differs} changed, ${counts.substantive} still differ after allowing for the two\n` +
			"universal rewrites — each of those needs a rule of its own.",
	);

	if (unexpected) {
		console.log(
			`\n${unexpected} probe(s) marked CHANGED — this SurrealDB behaves differently from what SURREALDB-FINDINGS.md records.`,
		);
	}

	return unexpected;
}

function parseArgs(argv: string[]): Options {
	const get = (flag: string, fallback: string): string => {
		const at = argv.indexOf(flag);
		return at === -1 ? fallback : (argv[at + 1] ?? fallback);
	};

	return {
		endpoint: get("--endpoint", "http://127.0.0.1:8000").replace(/^ws/, "http"),
		user: get("--user", "root"),
		pass: get("--pass", "root"),
		group: argv.includes("--group") ? get("--group", "") : undefined,
		verbose: argv.includes("--verbose"),
	};
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	const probes = options.group
		? PROBES.filter((p) => p.group === options.group)
		: PROBES;

	if (!probes.length) {
		console.error(`No probes in group '${options.group}'.`);
		process.exit(1);
	}

	const reachable = await query(options, "RETURN 1;").catch(() => null);
	if (!reachable?.ok) {
		console.error(`Cannot reach ${options.endpoint}.`);
		process.exit(1);
	}

	console.log(`SurrealDB at ${options.endpoint}`);
	console.log(`${probes.length} probes`);
	console.log(
		"\nTwo rewrites apply to every field, so they account for part of most\n" +
			"differences below: `ON TABLE t` is stored as `ON t`, and a PERMISSIONS\n" +
			"clause is appended whether or not one was written.",
	);

	const results: Result[] = [];
	for (const [index, probe] of probes.entries()) {
		results.push(await runProbe(options, probe, index));
	}

	process.exit(report(results, options));
}

await main();
