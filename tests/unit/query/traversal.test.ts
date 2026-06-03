import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import {
	__display,
	displayContext,
	edge,
	type IncomingEdges,
	type OutgoingEdges,
	orm,
	type ToOf,
	t,
	table,
} from "../../../src";

// Compile-time equality assertion helper.
type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;

const user = table("user", {
	name: t.object({ first: t.string(), last: t.string() }),
	age: t.number(),
});
const post = table("post", { title: t.string() });
const tag = table("tag", { label: t.string() });
const authored = edge("user", "authored", "post", {
	created: t.date(),
	role: t.string(),
});
const tagged = edge("post", "tagged", "tag", {});

const db = orm(new Surreal(), user, post, tag, authored, tagged);

const render = (q: {
	[__display]: (ctx: ReturnType<typeof displayContext>) => string;
}) => q[__display](displayContext());

describe("graph traversal — SurrealQL generation", () => {
	test("outgoing single hop: ->edge->target", () => {
		const q = db
			.select("user")
			.return((u) => ({ posts: u.id.out("authored") }));
		const sql = render(q);
		expect(sql).toContain("->authored->post");
		expect(sql).toContain("$this.id->authored->post");
	});

	test("incoming single hop: <-edge<-source", () => {
		const q = db
			.select("post")
			.return((p) => ({ authors: p.id.in("authored") }));
		const sql = render(q);
		expect(sql).toContain("<-authored<-user");
	});

	test("multi-hop chaining: ->authored->post->tagged->tag", () => {
		const q = db
			.select("user")
			.return((u) => ({ tags: u.id.out("authored").out("tagged") }));
		const sql = render(q);
		expect(sql).toContain("->authored->post->tagged->tag");
	});

	test("outEdge lands on the edge, not the far node", () => {
		const q = db
			.select("user")
			.return((u) => ({ edges: u.id.outEdge("authored") }));
		const sql = render(q);
		expect(sql).toContain("->authored");
		expect(sql).not.toContain("->authored->post");
	});

	test("inEdge lands on the edge in the incoming direction", () => {
		const q = db
			.select("post")
			.return((p) => ({ edges: p.id.inEdge("authored") }));
		const sql = render(q);
		expect(sql).toContain("<-authored");
		expect(sql).not.toContain("<-authored<-user");
	});

	test("WHERE: array::len over a traversal", () => {
		const q = db.select("user").where((u) => u.id.out("authored").len().gt(0));
		const sql = render(q);
		expect(sql).toContain("array::len($this.id->authored->post)");
		expect(sql).toContain(" > ");
	});

	test("WHERE: array::is_empty over a traversal", () => {
		const q = db.select("user").where((u) => u.id.out("authored").isEmpty());
		const sql = render(q);
		expect(sql).toContain("array::is_empty($this.id->authored->post)");
	});

	test("edge filtering: ->(edge WHERE …)->target", () => {
		const q = db.select("user").return((u) => ({
			posts: u.id.out("authored", { where: (e) => e.role.eq("author") }),
		}));
		const sql = render(q);
		expect(sql).toContain("->(authored WHERE role = ");
		expect(sql).toContain(")->post");
	});

	test(".select().return() wraps the traversal in a subquery", () => {
		const q = db.select("user").return((u) => ({
			posts: u.id
				.out("authored")
				.select()
				.return((p) => ({ title: p.title })),
		}));
		const sql = render(q);
		expect(sql).toContain("SELECT VALUE");
		expect(sql).toContain("->authored->post");
		// inside the nested subquery the outer row is referenced as $parent
		expect(sql).toContain("$parent.id->authored->post");
	});

	test("bare step renders inside a projection", () => {
		const q = db
			.select("user")
			.return((u) => ({ posts: u.id.out("authored") }));
		const sql = render(q);
		expect(sql).toContain("{ posts: $this.id->authored->post }");
	});
});

describe("graph traversal — type-level", () => {
	type Ctx = { orm: typeof db; id: symbol };

	test("edge → table resolution", () => {
		const _to: Equal<ToOf<Ctx, "authored">, "post"> = true;
		const _tagged: Equal<ToOf<Ctx, "tagged">, "tag"> = true;
		expect(_to && _tagged).toBe(true);
	});

	test("edge enumeration per direction", () => {
		const _out: Equal<OutgoingEdges<Ctx, "user">, "authored"> = true;
		const _in: Equal<IncomingEdges<Ctx, "post">, "authored"> = true;
		expect(_out && _in).toBe(true);
	});

	test("bare traversal infers as an array of record links", () => {
		const q = db
			.select("user")
			.return((u) => ({ posts: u.id.out("authored") }));
		type R = t.infer<typeof q>;
		const _check: Equal<R, { posts: RecordId<"post">[] }[]> = true;
		expect(_check).toBe(true);
	});

	test("projected .select() infers as an array of the projection", () => {
		const q = db.select("user").return((u) => ({
			posts: u.id
				.out("authored")
				.select()
				.return((p) => ({ title: p.title })),
		}));
		type R = t.infer<typeof q>;
		const _check: Equal<R, { posts: { title: string }[] }[]> = true;
		expect(_check).toBe(true);
	});

	test("traversing a non-existent / wrong-direction edge is a type error", () => {
		// Never invoked — present only so `tsc` checks the @ts-expect-error cases.
		const _typeErrors = () => {
			db.select("user").return((u) => ({
				// @ts-expect-error "nope" is not an outgoing edge of user
				x: u.id.out("nope"),
			}));
			db.select("user").return((u) => ({
				// @ts-expect-error "tagged" starts at post, not user
				x: u.id.out("tagged"),
			}));
		};
		expect(typeof _typeErrors).toBe("function");
	});
});

describe("graph traversal — row-level sugar", () => {
	test("user.out(edge) roots at the row's id", () => {
		const q = db.select("user").return((u) => ({ posts: u.out("authored") }));
		const sql = render(q);
		expect(sql).toContain("$this.id->authored->post");
	});

	test("sugar works in WHERE", () => {
		const q = db.select("user").where((u) => u.out("authored").len().gt(0));
		const sql = render(q);
		expect(sql).toContain("array::len($this.id->authored->post)");
	});

	test("sugar matches the explicit .id form", () => {
		const sugar = render(
			db.select("user").return((u) => ({ posts: u.out("authored") })),
		);
		const explicit = render(
			db.select("user").return((u) => ({ posts: u.id.out("authored") })),
		);
		expect(sugar).toBe(explicit);
	});

	test("does not shadow an edge table's in/out fields", () => {
		// Selecting the `authored` edge: `in`/`out` must stay field accesses.
		const q = db.select("authored").return((e) => ({ from: e.in, to: e.out }));
		const sql = render(q);
		expect(sql).toContain("$this.in");
		expect(sql).toContain("$this.out");
		expect(sql).not.toContain("->");
		expect(sql).not.toContain("<-");
	});
});

describe("graph traversal — recursive / path finding", () => {
	const person = table("person", { name: t.string() });
	const knows = edge("person", "knows", "person", {});
	const rdb = orm(new Surreal(), person, knows);

	test("range depth: head.{min..max}(->edge->target)", () => {
		const q = rdb
			.select("person")
			.return((p) => ({ net: p.out("knows", { depth: [1, 3] }) }));
		expect(render(q)).toContain("$this.id.{1..3}(->knows->person)");
	});

	test("exact depth: .{n}", () => {
		const q = rdb
			.select("person")
			.return((p) => ({ net: p.out("knows", { depth: 2 }) }));
		expect(render(q)).toContain(".{2}(->knows->person)");
	});

	test("open-ended depth: .{..max}", () => {
		const q = rdb
			.select("person")
			.return((p) => ({ net: p.out("knows", { depth: { max: 5 } }) }));
		expect(render(q)).toContain(".{..5}(->knows->person)");
	});

	test("collect modifier: .{..+collect}", () => {
		const q = rdb
			.select("person")
			.return((p) => ({ net: p.out("knows", { collect: true }) }));
		expect(render(q)).toContain(".{..+collect}(->knows->person)");
	});

	test("shortest path binds the target as a parameter", () => {
		const target = new RecordId("person", "z");
		const q = rdb
			.select("person")
			.return((p) => ({ path: p.out("knows", { shortest: target }) }));
		const ctx = displayContext();
		const sql = q[__display](ctx);
		expect(sql).toMatch(/\.\{\.\.\+shortest=\$_v\d+\}\(->knows->person\)/);
		expect(Object.values(ctx.variables)).toContainEqual(target);
	});

	test("recursion composes with an edge filter", () => {
		const q = rdb.select("person").return((p) => ({
			net: p.out("knows", { depth: [1, 2], where: (e) => e.id.trueish() }),
		}));
		expect(render(q)).toContain(".{1..2}(->(knows WHERE");
	});
});
