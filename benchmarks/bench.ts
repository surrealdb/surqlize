/**
 * Query-construction benchmarks. No database is needed: every scenario builds
 * a query and renders it to SurrealQL (or parses a result) in-process.
 *
 *   bun run bench                 # run everything, print a table
 *   bun run bench select          # only scenarios whose name contains "select"
 *   bun run bench --json out.json # also write the results as JSON
 *
 * Each scenario is calibrated to run for ~TARGET_MS per sample, sampled
 * SAMPLES times after a warm-up. The table reports the best (minimum) sample
 * per op, which is the most stable figure on a busy machine, and the median
 * alongside it. Numbers are only comparable on the same machine.
 */
import { RecordId, Surreal } from "surrealdb";
import { and, edge, or, orm, t, table } from "../src";

const TARGET_MS = 60;
const SAMPLES = 15;

type Scenario = { name: string; fn: () => unknown };
const scenarios: Scenario[] = [];
const scenario = (name: string, fn: () => unknown) =>
	scenarios.push({ name, fn });

// Defeats dead-code elimination of the measured result.
let sink: unknown;

// ---------------------------------------------------------------- fixtures

const user = table("user", {
	name: t.object({ first: t.string(), last: t.string() }),
	age: t.number(),
	email: t.string(),
	active: t.bool(),
	tags: t.array(t.string()),
	created: t.date(),
});
const post = table("post", {
	title: t.string(),
	body: t.string(),
	author: t.record("user"),
	views: t.number(),
});
const tag = table("tag", { label: t.string() });
const authored = edge("user", "authored", "post", {
	created: t.date(),
	role: t.string(),
});
const tagged = edge("post", "tagged", "tag", {});

/** A table with many scalar fields. */
type WideKeys = "field0" | "field10" | "field20" | "field30" | "field39";
const wideFields = Object.fromEntries(
	Array.from({ length: 40 }, (_, i) => [`field${i}`, t.string()]),
) as Record<WideKeys, ReturnType<typeof t.string>>;
const wide = table("wide", wideFields);

/** A schema nested six levels deep. */
const deepType = t.object({
	a: t.object({
		b: t.object({
			c: t.object({
				d: t.object({ e: t.object({ leaf: t.string(), n: t.number() }) }),
			}),
		}),
	}),
});
const deep = table("deep", { root: deepType, label: t.string() });

const db = orm(new Surreal(), user, post, tag, authored, tagged, wide, deep);

// Realistic, 10-field rows (with nesting) for the parse scenarios.
const rowTable = table("row", {
	name: t.string(),
	age: t.number(),
	email: t.string(),
	active: t.bool(),
	tags: t.array(t.string()),
	created: t.date(),
	profile: t.object({
		bio: t.string(),
		address: t.object({ city: t.string(), zip: t.string() }),
	}),
	author: t.record("user"),
	scores: t.array(t.number()),
	nick: t.option(t.string()),
});
const makeRow = (i: number) => ({
	id: new RecordId("row", i),
	name: `name ${i}`,
	age: i % 90,
	email: `user${i}@example.com`,
	active: i % 2 === 0,
	tags: ["a", "b", "c"],
	created: new Date(1_700_000_000_000 + i),
	profile: { bio: "lorem ipsum", address: { city: "Paris", zip: "75001" } },
	author: new RecordId("user", i),
	scores: [1, 2, 3, 4, 5],
	nick: i % 3 === 0 ? undefined : `nick${i}`,
});
const rows1k = Array.from({ length: 1000 }, (_, i) => makeRow(i));
const rowSchema = rowTable.schema;
const rowsArraySchema = t.array(rowSchema);

const userRows = Array.from({ length: 1000 }, (_, i) => ({
	id: new RecordId("user", i),
	name: { first: "A", last: "B" },
	age: i,
	email: "a@b.c",
	active: true,
	tags: ["x"],
	created: new Date(i),
}));

const insertRows = Array.from({ length: 100 }, (_, i) => ({
	title: `title ${i}`,
	body: "lorem ipsum dolor sit amet",
	author: new RecordId("user", i),
	views: i,
}));

const wideData: Record<string, string> = {};
for (let i = 0; i < 40; i++) wideData[`field${i}`] = `value ${i}`;

// --------------------------------------------------------------- scenarios

scenario("select: simple (build + render)", () =>
	db
		.select("user")
		.where((u) => u.age.gt(18))
		.toString(),
);

const buildComplex = () =>
	db
		.select("post")
		.where((p) => and(p.views.gt(10), or(p.title.eq("a"), p.title.eq("b"))))
		.orderBy((p) => p.views, "DESC")
		.orderBy("title")
		.limit(20)
		.start(40)
		.fetch("author")
		.return((p) => ({ title: p.title, author: p.author, views: p.views }));

scenario("select: where/orderBy/fetch/return (build + render)", () =>
	buildComplex().toString(),
);

const complexSelect = buildComplex();
scenario("select: where/orderBy/fetch/return (render only)", () =>
	complexSelect.toString(),
);

scenario("select: object filter + orderBy object (build + render)", () =>
	db
		.select("user")
		.where({ active: true, age: { gt: 18 }, name: { first: "Ada" } })
		.orderBy({ age: "desc", name: { last: "asc" } })
		.toString(),
);

scenario("select: prepare() (build + bind)", () =>
	db
		.select("user")
		.where((u) => u.age.gt(18))
		.prepare(),
);

scenario("create: 40 fields via set (build + render)", () =>
	db.create("wide").set(wideData).toString(),
);

scenario("create: content + return (build + render)", () =>
	db
		.create("user")
		.content({
			name: { first: "Ada", last: "Lovelace" },
			age: 36,
			email: "ada@example.com",
			active: true,
			tags: ["a", "b"],
			created: new Date(0),
		})
		.return("after")
		.toString(),
);

scenario("insert: 100 rows x 4 fields (build + render)", () =>
	db.insert("post", insertRows).toString(),
);

scenario("insert: fields().values() 100 rows (build + render)", () =>
	db
		.insert("post")
		.fields(["title", "body", "author", "views"])
		.values(
			...insertRows.map(
				(r) =>
					[r.title, r.body, r.author, r.views] as [
						string,
						string,
						RecordId<"user">,
						number,
					],
			),
		)
		.toString(),
);

scenario("deep schema: nested where + return (build + render)", () =>
	db
		.select("deep")
		.where((d) => d.root.a.b.c.d.e.leaf.eq("x"))
		.orderBy((d) => d.root.a.b.c.d.e.n)
		.return((d) => ({
			leaf: d.root.a.b.c.d.e.leaf,
			n: d.root.a.b.c.d.e.n,
			label: d.label,
		}))
		.toString(),
);

scenario("wide schema: where on 5 of 40 fields (build + render)", () =>
	db
		.select("wide")
		.where((w) =>
			and(
				w.field0.eq("a"),
				w.field10.eq("b"),
				w.field20.eq("c"),
				w.field30.eq("d"),
				w.field39.eq("e"),
			),
		)
		.toString(),
);

scenario("graph: multi-hop traversal in return (build + render)", () =>
	db
		.select("user")
		.return((u) => ({
			posts: u.id.out("authored").out("post"),
			tags: u.id.out("authored").out("post").out("tagged").out("tag"),
		}))
		.toString(),
);

scenario("graph: edge-row sugar traversal (build + render)", () =>
	db
		.select("post")
		.return((p) => ({ authors: p.in("authored").in("user") }))
		.toString(),
);

scenario("schema: table() + .schema access x10", () => {
	const tb = table("tmp", { a: t.string(), b: t.number(), c: t.bool() });
	for (let i = 0; i < 10; i++) sink = tb.schema;
	return tb;
});

scenario("parse: 1000 rows x 11 fields (array schema.parse)", () =>
	rowsArraySchema.parse(rows1k),
);

scenario("parse: single row (schema.parse)", () => rowSchema.parse(rows1k[0]));

scenario("parse: select result via parseResult (1000 rows)", () =>
	db.select("user").parseResult(userRows),
);

// ------------------------------------------------------------------ runner

const args = process.argv.slice(2);
const jsonIdx = args.indexOf("--json");
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : undefined;
const filters = args.filter(
	(a, i) => !a.startsWith("--") && (jsonIdx < 0 || i !== jsonIdx + 1),
);

const median = (xs: number[]) => {
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)] as number;
};

function measure(fn: () => unknown) {
	// Warm up so the JIT has seen the code before timing.
	for (let i = 0; i < 200; i++) sink = fn();

	// Calibrate: how many iterations fill ~TARGET_MS.
	let iters = 1;
	for (;;) {
		const start = performance.now();
		for (let i = 0; i < iters; i++) sink = fn();
		const elapsed = performance.now() - start;
		if (elapsed >= TARGET_MS / 2) {
			iters = Math.max(1, Math.round((iters * TARGET_MS) / elapsed));
			break;
		}
		iters *= 2;
	}

	const perOp: number[] = [];
	for (let s = 0; s < SAMPLES; s++) {
		const start = performance.now();
		for (let i = 0; i < iters; i++) sink = fn();
		perOp.push(((performance.now() - start) * 1000) / iters); // microseconds
	}
	return { us: Math.min(...perOp), median: median(perOp) };
}

const results: Record<
	string,
	{ us: number; median: number; opsPerSec: number }
> = {};
const selected = scenarios.filter(
	(s) => filters.length === 0 || filters.some((f) => s.name.includes(f)),
);
const width = Math.max(...selected.map((s) => s.name.length));
console.log(
	`${"scenario".padEnd(width)}  ${"best/op".padStart(12)}  ${"median/op".padStart(12)}  ${"ops/sec".padStart(10)}`,
);
for (const s of selected) {
	const { us, median: med } = measure(s.fn);
	const opsPerSec = 1_000_000 / us;
	results[s.name] = { us, median: med, opsPerSec };
	const fmt = (v: number) =>
		v >= 1000 ? `${(v / 1000).toFixed(3)} ms` : `${v.toFixed(2)} us`;
	console.log(
		`${s.name.padEnd(width)}  ${fmt(us).padStart(12)}  ${fmt(med).padStart(12)}  ${Math.round(opsPerSec).toLocaleString("en-US").padStart(10)}`,
	);
}
void sink;

if (jsonOut) {
	await Bun.write(jsonOut, `${JSON.stringify(results, null, 2)}\n`);
	console.log(`\nwrote ${jsonOut}`);
}
