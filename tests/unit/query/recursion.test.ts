import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import {
	__display,
	displayContext,
	edge,
	OrmError,
	orm,
	t,
	table,
} from "../../../src";

// Compile-time equality assertion helper.
type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;

const person = table("person", { name: t.string() });
const post = table("post", { title: t.string() });
const knows = edge("person", "knows", "person", { since: t.number() });
const wrote = edge("person", "wrote", "post", {});

const db = orm(new Surreal(), person, post, knows, wrote);

const render = (q: {
	[__display]: (ctx: ReturnType<typeof displayContext>) => string;
}) => {
	const ctx = displayContext();
	return [q[__display](ctx), ctx.variables] as const;
};

const sqlOf = (q: Parameters<typeof render>[0]) => render(q)[0];

describe("recursive traversal — SurrealQL generation", () => {
	test("fixed depth: .{n}(step)", () => {
		const q = db.select("person").return((p) => ({
			r: p.recurse(3, (n) => n.out("knows").out("person")),
		}));
		expect(sqlOf(q)).toContain("$this.id.{3}(->knows->person)");
	});

	test("depth ranges", () => {
		const q = db.select("person").return((p) => ({
			a: p.recurse({ min: 2, max: 4 }, (n) => n.out("knows").out("person")),
			b: p.recurse({ min: 2 }, (n) => n.out("knows").out("person")),
			c: p.recurse({ max: 4 }, (n) => n.out("knows").out("person")),
			d: p.recurse({}, (n) => n.out("knows").out("person")),
		}));
		const sql = sqlOf(q);
		expect(sql).toContain("$this.id.{2..4}(->knows->person)");
		expect(sql).toContain("$this.id.{2..}(->knows->person)");
		expect(sql).toContain("$this.id.{..4}(->knows->person)");
		expect(sql).toContain("$this.id.{..}(->knows->person)");
	});

	test("collect: with and without a depth, inclusive", () => {
		const q = db.select("person").return((p) => ({
			a: p.collect((n) => n.out("knows").out("person")),
			b: p.collect({ max: 3 }, (n) => n.out("knows").out("person")),
			c: p.collect(2, (n) => n.out("knows").out("person")),
			d: p.collect({ min: 1, max: 3 }, (n) => n.out("knows").out("person"), {
				inclusive: true,
			}),
			e: p.collect((n) => n.out("knows").out("person"), { inclusive: true }),
		}));
		const sql = sqlOf(q);
		expect(sql).toContain("$this.id.{..+collect}(->knows->person)");
		expect(sql).toContain("$this.id.{..3+collect}(->knows->person)");
		expect(sql).toContain("$this.id.{2+collect}(->knows->person)");
		expect(sql).toContain("$this.id.{1..3+collect+inclusive}(->knows->person)");
		expect(sql).toContain("$this.id.{..+collect+inclusive}(->knows->person)");
	});

	test("shortest binds the target as a parameter", () => {
		const [sql, vars] = render(
			db.select("person").return((p) => ({
				path: p.shortest(new RecordId("person", "z"), (n) =>
					n.out("knows").out("person"),
				),
			})),
		);
		expect(sql).toMatch(
			/\$this\.id\.\{\.\.\+shortest=\$\w+\}\(->knows->person\)/,
		);
		expect(Object.values(vars)).toContainEqual(new RecordId("person", "z"));
	});

	test("shortest + inclusive", () => {
		const q = db.select("person").return((p) => ({
			path: p.shortest(
				new RecordId("person", "z"),
				(n) => n.out("knows").out("person"),
				{ inclusive: true },
			),
		}));
		expect(sqlOf(q)).toMatch(/\+shortest=\$\w+\+inclusive\}/);
	});

	test("edge filters and multi-edge steps work inside the body", () => {
		const q = db.select("person").return((p) => ({
			r: p.recurse(2, (n) =>
				n.out((g) => g("knows").where((e) => e.since.gt(2000))).out("person"),
			),
		}));
		expect(sqlOf(q)).toMatch(
			/\$this\.id\.\{2\}\(->\(knows WHERE since > \$\w+\)->person\)/,
		);
	});

	test("recursion works on a record id and nests in subqueries", () => {
		const q = db.select("person").return((p) => ({
			friends: p.id
				.collect(3, (n) => n.out("knows").out("person"))
				.select()
				.return((f) => ({ name: f.name })),
		}));
		expect(sqlOf(q)).toContain("FROM $parent.id.{3+collect}(->knows->person)");
	});

	test("composes with array predicates", () => {
		const q = db.select("person").where((p) =>
			p
				.collect(2, (n) => n.out("knows").out("person"))
				.len()
				.gt(0),
		);
		expect(sqlOf(q)).toContain(
			"array::len($this.id.{2+collect}(->knows->person))",
		);
	});

	test("rejects invalid depths", () => {
		const build = (depth: number | { min?: number; max?: number }) =>
			sqlOf(
				db.select("person").return((p) => ({
					r: p.recurse(depth, (n) => n.out("knows").out("person")),
				})),
			);
		expect(() => build(0)).toThrow(OrmError);
		expect(() => build(257)).toThrow(OrmError);
		expect(() => build(1.5)).toThrow(OrmError);
		expect(() => build({ min: 0 })).toThrow(OrmError);
		expect(() => build({ min: 4, max: 2 })).toThrow(OrmError);
		expect(() => build({ min: 1, max: 256 })).not.toThrow();
	});
});

describe("recursive traversal — types", () => {
	test("results are typed as the node record type", () => {
		const q = db.select("person").return((p) => ({
			nodes: p.collect((n) => n.out("knows").out("person")),
			deep: p.recurse({ min: 1, max: 3 }, (n) => n.out("knows").out("person")),
			path: p.shortest(new RecordId("person", "z"), (n) =>
				n.out("knows").out("person"),
			),
			mapped: p
				.collect((n) => n.out("knows").out("person"))
				.select()
				.return((f) => ({ name: f.name })),
			optionalMapped: p
				.shortest(new RecordId("person", "z"), (n) =>
					n.out("knows").out("person"),
				)
				.unwrap()
				.select()
				.return((f) => ({ name: f.name })),
		}));
		type R = t.infer<typeof q>[number];
		const _nodes: Equal<R["nodes"], RecordId<"person">[]> = true;
		const _deep: Equal<R["deep"], RecordId<"person">[]> = true;
		const _path: Equal<R["path"], RecordId<"person">[] | undefined> = true;
		const _mapped: Equal<R["mapped"], { name: string }[]> = true;
		const _optionalMapped: Equal<R["optionalMapped"], { name: string }[]> =
			true;
		void [_nodes, _deep, _path, _mapped, _optionalMapped];
	});

	test("the body must land back on the same table", () => {
		db.select("person").return((p) => ({
			// @ts-expect-error — `->wrote->post` lands on `post`, not `person`
			bad: p.collect((n) => n.out("wrote").out("post")),
		}));
		db.select("person").return((p) => ({
			// @ts-expect-error — edges not connected to `person` are rejected
			bad: p.collect((n) => n.out("nope").out("person")),
		}));
	});
});
