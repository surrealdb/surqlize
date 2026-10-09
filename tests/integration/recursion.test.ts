import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { edge, orm, t, table } from "../../src";
import { atLeast, serverVersion } from "../helpers/db";
import { withTestDb } from "./setup";

// SurrealDB 3.0 answers a fixed-depth `+collect` (`.{2+collect}`) with only the
// nodes first reached at that depth; 3.1+ returns every node at that depth.
const fixedDepthCollect = atLeast(await serverVersion(), 3, 1);

describe("recursive graph traversal integration tests", () => {
	const person = table("person", { name: t.string() });
	const knows = edge("person", "knows", "person", { since: t.number() });
	const schema = [person, knows] as const;

	// a -> b -> c -> d
	// a -> c            (shortcut)
	// a -> e
	// p -> q -> r -> p  (cycle)
	// z                 (isolated)
	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await surreal.query(`
				CREATE person:a SET name = "A";
				CREATE person:b SET name = "B";
				CREATE person:c SET name = "C";
				CREATE person:d SET name = "D";
				CREATE person:e SET name = "E";
				CREATE person:p SET name = "P";
				CREATE person:q SET name = "Q";
				CREATE person:r SET name = "R";
				CREATE person:z SET name = "Z";
				RELATE person:a->knows->person:b SET since = 2020;
				RELATE person:b->knows->person:c SET since = 2020;
				RELATE person:c->knows->person:d SET since = 2020;
				RELATE person:a->knows->person:c SET since = 2010;
				RELATE person:a->knows->person:e SET since = 2020;
				RELATE person:p->knows->person:q SET since = 2020;
				RELATE person:q->knows->person:r SET since = 2020;
				RELATE person:r->knows->person:p SET since = 2020;
			`);
		},
	});

	const ids = (links: RecordId[] | undefined) =>
		(links ?? []).map((l) => String(l.id)).sort();

	test("fixed depth yields the nodes exactly n hops away", async () => {
		const db = orm(getTestDb().surreal, ...schema);
		const [row] = await db
			.select("person", "a")
			.return((p) => ({
				two: p.recurse(2, (n) => n.out("knows").out("person")),
				three: p.recurse(3, (n) => n.out("knows").out("person")),
				none: p.recurse(5, (n) => n.out("knows").out("person")),
			}))
			.execute();

		expect(ids(row?.two)).toEqual(["c", "d"]);
		expect(ids(row?.three)).toEqual(["d"]);
		expect(row?.none).toEqual([]);
		expect(row?.two[0]).toBeInstanceOf(RecordId);
	});

	test("depth ranges", async () => {
		const db = orm(getTestDb().surreal, ...schema);
		const [row] = await db
			.select("person", "a")
			.return((p) => ({
				bounded: p.recurse({ min: 1, max: 3 }, (n) =>
					n.out("knows").out("person"),
				),
				atLeast: p.recurse({ min: 2, max: 3 }, (n) =>
					n.out("knows").out("person"),
				),
				atMost: p.recurse({ max: 2 }, (n) => n.out("knows").out("person")),
				tooShallow: p.recurse({ min: 5, max: 6 }, (n) =>
					n.out("knows").out("person"),
				),
			}))
			.execute();

		expect(ids(row?.bounded)).toEqual(["d"]);
		expect(ids(row?.atLeast)).toEqual(["d"]);
		expect(ids(row?.atMost)).toEqual(["c", "d"]);
		expect(row?.tooShallow).toEqual([]);
	});

	test("collect returns unique nodes reached within the depth", async () => {
		const db = orm(getTestDb().surreal, ...schema);
		const [row] = await db
			.select("person", "a")
			.return((p) => ({
				all: p.collect((n) => n.out("knows").out("person")),
				oneHop: p.collect({ max: 1 }, (n) => n.out("knows").out("person")),
				exact: p.collect(2, (n) => n.out("knows").out("person")),
				withSelf: p.collect({ max: 1 }, (n) => n.out("knows").out("person"), {
					inclusive: true,
				}),
			}))
			.execute();

		// c is reachable twice (a->c, a->b->c) but is only returned once
		expect(ids(row?.all)).toEqual(["b", "c", "d", "e"]);
		expect(ids(row?.oneHop)).toEqual(["b", "c", "e"]);
		if (fixedDepthCollect) expect(ids(row?.exact)).toEqual(["c", "d"]);
		else expect(ids(row?.exact)).toEqual(["d"]);
		expect(ids(row?.withSelf)).toEqual(["a", "b", "c", "e"]);
	});

	test("collect terminates on cycles", async () => {
		const db = orm(getTestDb().surreal, ...schema);
		const [row] = await db
			.select("person", "p")
			.return((p) => ({
				all: p.collect((n) => n.out("knows").out("person")),
			}))
			.execute();

		expect(ids(row?.all)).toEqual(["p", "q", "r"].sort());
	});

	test("collected nodes materialise with .select()", async () => {
		const db = orm(getTestDb().surreal, ...schema);
		const [row] = await db
			.select("person", "a")
			.return((p) => ({
				friends: p
					.collect((n) => n.out("knows").out("person"))
					.select()
					.return((f) => ({ name: f.name })),
			}))
			.execute();

		expect(row?.friends.map((f) => f.name).sort()).toEqual([
			"B",
			"C",
			"D",
			"E",
		]);
	});

	test("recursion filters the outer query in WHERE", async () => {
		const db = orm(getTestDb().surreal, ...schema);
		const rows = await db
			.select("person")
			.where((p) =>
				p
					.collect((n) => n.out("knows").out("person"))
					.len()
					.gt(2),
			)
			.return((p) => ({ name: p.name }))
			.execute();

		// a reaches 4 nodes, b reaches 2, c reaches 1; the cycle members reach 3
		expect(rows.map((r) => r.name).sort()).toEqual(["A", "P", "Q", "R"]);
	});

	test("edge filters apply at every hop", async () => {
		const db = orm(getTestDb().surreal, ...schema);
		const [row] = await db
			.select("person", "a")
			.return((p) => ({
				recent: p.collect((n) =>
					n
						.out((g) => g("knows").where((e) => e.since.gte(2015)))
						.out("person"),
				),
			}))
			.execute();

		// the a->c shortcut (2010) is skipped, c is still reached through b
		expect(ids(row?.recent)).toEqual(["b", "c", "d", "e"]);
	});

	test("shortest returns the nodes walked to the target", async () => {
		const db = orm(getTestDb().surreal, ...schema);
		const [row] = await db
			.select("person", "a")
			.return((p) => ({
				path: p.shortest(new RecordId("person", "d"), (n) =>
					n.out("knows").out("person"),
				),
				inclusive: p.shortest(
					new RecordId("person", "d"),
					(n) => n.out("knows").out("person"),
					{ inclusive: true },
				),
			}))
			.execute();

		// a -> c -> d beats a -> b -> c -> d
		expect(row?.path?.map((l) => String(l.id))).toEqual(["c", "d"]);
		expect(row?.inclusive?.map((l) => String(l.id))).toEqual(["a", "c", "d"]);
	});

	test("shortest is undefined when the target is unreachable", async () => {
		const db = orm(getTestDb().surreal, ...schema);
		const [row] = await db
			.select("person", "a")
			.return((p) => ({
				path: p.shortest(new RecordId("person", "z"), (n) =>
					n.out("knows").out("person"),
				),
			}))
			.execute();

		expect(row?.path).toBeUndefined();
	});

	test("shortest path nodes materialise via unwrap().select()", async () => {
		const db = orm(getTestDb().surreal, ...schema);
		const [row] = await db
			.select("person", "a")
			.return((p) => ({
				path: p
					.shortest(new RecordId("person", "d"), (n) =>
						n.out("knows").out("person"),
					)
					.unwrap()
					.select()
					.return((f) => ({ name: f.name })),
			}))
			.execute();

		expect(row?.path).toEqual([{ name: "C" }, { name: "D" }]);
	});

	test("recursion works from a record id outside a select row", async () => {
		const db = orm(getTestDb().surreal, ...schema);
		const [row] = await db
			.select("person", "b")
			.return((p) => ({
				reach: p.id.collect((n) => n.out("knows").out("person")),
			}))
			.execute();

		expect(ids(row?.reach)).toEqual(["c", "d"]);
	});
});
