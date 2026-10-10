import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import {
	__display,
	ANY,
	displayContext,
	edge,
	type FromOf,
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
	test("outgoing edge step: ->edge", () => {
		const q = db
			.select("user")
			.return((u) => ({ edges: u.id.out("authored") }));
		const sql = render(q);
		expect(sql).toContain("->authored");
		expect(sql).toContain("$this.id->authored");
		expect(sql).not.toContain("->authored->post");
	});

	test("outgoing edge then node: ->edge->target", () => {
		const q = db
			.select("user")
			.return((u) => ({ posts: u.id.out("authored").out("post") }));
		const sql = render(q);
		expect(sql).toContain("->authored->post");
		expect(sql).toContain("$this.id->authored->post");
	});

	test("incoming edge step: <-edge", () => {
		const q = db.select("post").return((p) => ({ edges: p.id.in("authored") }));
		const sql = render(q);
		expect(sql).toContain("<-authored");
		expect(sql).not.toContain("<-authored<-user");
	});

	test("incoming edge then node: <-edge<-source", () => {
		const q = db
			.select("post")
			.return((p) => ({ authors: p.id.in("authored").in("user") }));
		const sql = render(q);
		expect(sql).toContain("<-authored<-user");
	});

	test("multi-hop chaining: ->authored->post->tagged->tag", () => {
		const q = db.select("user").return((u) => ({
			tags: u.id.out("authored").out("post").out("tagged").out("tag"),
		}));
		const sql = render(q);
		expect(sql).toContain("->authored->post->tagged->tag");
	});

	test("multiple args are alternatives in one segment", () => {
		const q = db
			.select("user")
			.return((u) => ({ edges: u.id.out("authored", ANY) }));
		const sql = render(q);
		expect(sql).toContain("->(authored, ?)");
	});

	test("edge rows expose their fields", () => {
		const q = db.select("user").return((u) => ({
			edges: u.id
				.out("authored")
				.select()
				.return((e) => ({ role: e.role })),
		}));
		const sql = render(q);
		expect(sql).toContain("FROM $parent.id->authored");
		expect(sql).toContain("role: $this.role");
	});

	test("incoming edge rows expose their fields", () => {
		const q = db.select("post").return((p) => ({
			edges: p.id
				.in("authored")
				.select()
				.return((e) => ({ role: e.role })),
		}));
		const sql = render(q);
		expect(sql).toContain("FROM $parent.id<-authored");
		expect(sql).toContain("role: $this.role");
	});

	test("WHERE: array::len over a traversal", () => {
		const q = db
			.select("user")
			.where((u) => u.id.out("authored").out("post").len().gt(0));
		const sql = render(q);
		expect(sql).toContain("array::len($this.id->authored->post)");
		expect(sql).toContain(" > ");
	});

	test("WHERE: array::is_empty over a traversal", () => {
		const q = db
			.select("user")
			.where((u) => u.id.out("authored").out("post").isEmpty());
		const sql = render(q);
		expect(sql).toContain("array::is_empty($this.id->authored->post)");
	});

	test("edge filtering: ->(edge WHERE …)->target", () => {
		const q = db.select("user").return((u) => ({
			posts: u.id
				.out((g) => g("authored").where((e) => e.role.eq("author")))
				.out("post"),
		}));
		const sql = render(q);
		expect(sql).toContain("->(authored WHERE role = ");
		expect(sql).toContain(")->post");
	});

	test("mixes a plain alternative with a filtered one in one step", () => {
		const account = table("account", { handle: t.string() });
		const follows = edge("account", "follows", "account", { since: t.date() });
		const blocks = edge("account", "blocks", "account", { reason: t.string() });
		const sdb = orm(new Surreal(), account, follows, blocks);
		const q = sdb.select("account").return((a) => ({
			rel: a.id.out("follows", (g) =>
				g("blocks").where((e) => e.reason.eq("spam")),
			),
		}));
		const sql = render(q);
		// ->(follows, blocks WHERE reason = $v)
		expect(sql).toContain("->(follows, blocks WHERE reason = ");
	});

	test(".select().return() wraps the traversal in a subquery", () => {
		const q = db.select("user").return((u) => ({
			posts: u.id
				.out("authored")
				.out("post")
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
			.return((u) => ({ edges: u.id.out("authored") }));
		const sql = render(q);
		expect(sql).toContain("{ edges: $this.id->authored }");
	});

	test("orm.value(record id) can start a typed graph traversal", () => {
		const id = new RecordId("user", "alice");
		const expr = db.value(id).out("authored").out("post");
		const ctx = displayContext();
		const sql = expr[__display](ctx);

		expect(sql).toMatch(/\$_v\d+->authored->post/);
		expect(Object.values(ctx.variables)).toContainEqual(id);

		type R = t.infer<typeof expr>;
		const _check: Equal<R, RecordId<"post">[]> = true;
		expect(_check).toBe(true);
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

	test("bare edge traversal infers as edge record links", () => {
		const q = db
			.select("user")
			.return((u) => ({ edges: u.id.out("authored") }));
		type R = t.infer<typeof q>;
		const _check: Equal<R, { edges: RecordId<"authored">[] }[]> = true;
		expect(_check).toBe(true);
	});

	test("edge then node traversal infers as node record links", () => {
		const q = db
			.select("user")
			.return((u) => ({ posts: u.id.out("authored").out("post") }));
		type R = t.infer<typeof q>;
		const _check: Equal<R, { posts: RecordId<"post">[] }[]> = true;
		expect(_check).toBe(true);
	});

	test("filter callback infers the same landing node as the bare step", () => {
		const q = db.select("user").return((u) => ({
			posts: u.id
				.out((g) => g("authored").where((e) => e.role.eq("author")))
				.out("post"),
		}));
		type R = t.infer<typeof q>;
		const _check: Equal<R, { posts: RecordId<"post">[] }[]> = true;
		expect(_check).toBe(true);
	});

	test("ANY is type-safe for the current graph step", () => {
		const q = db.select("user").return((u) => ({ edges: u.id.out(ANY) }));
		type R = t.infer<typeof q>;
		const _check: Equal<R, { edges: RecordId<"authored">[] }[]> = true;
		expect(_check).toBe(true);
	});

	test("projected .select() infers as an array of the projection", () => {
		const q = db.select("user").return((u) => ({
			posts: u.id
				.out("authored")
				.out("post")
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
			db.select("user").return((u) => ({
				// @ts-expect-error after "authored", the outgoing node step is "post"
				x: u.id.out("authored").out("tag"),
			}));
			db.select("user").return((u) => ({
				// @ts-expect-error "tagged" is not an outgoing alternative from user
				x: u.id.out((g) => g("tagged")),
			}));
			db.select("user").return((u) => ({
				// @ts-expect-error "nope" is not a field of the authored edge
				x: u.id.out((g) => g("authored").where((e) => e.nope.eq("x"))),
			}));
		};
		expect(typeof _typeErrors).toBe("function");
	});
});

describe("graph traversal — row-level sugar", () => {
	test("user.out(edge) roots at the row's id", () => {
		const q = db
			.select("user")
			.return((u) => ({ posts: u.out("authored").out("post") }));
		const sql = render(q);
		expect(sql).toContain("$this.id->authored->post");
	});

	test("row sugar accepts the filter callback", () => {
		const q = db.select("user").return((u) => ({
			posts: u
				.out((g) => g("authored").where((e) => e.role.eq("author")))
				.out("post"),
		}));
		const sql = render(q);
		expect(sql).toContain("$this.id->(authored WHERE role = ");
		expect(sql).toContain(")->post");
	});

	test("sugar works in WHERE", () => {
		const q = db
			.select("user")
			.where((u) => u.out("authored").out("post").len().gt(0));
		const sql = render(q);
		expect(sql).toContain("array::len($this.id->authored->post)");
	});

	test("sugar matches the explicit .id form", () => {
		const sugar = render(
			db
				.select("user")
				.return((u) => ({ posts: u.out("authored").out("post") })),
		);
		const explicit = render(
			db
				.select("user")
				.return((u) => ({ posts: u.id.out("authored").out("post") })),
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

	// Regression for https://github.com/surrealdb/surqlize/issues/23: the
	// traversal-verb sugar must let an edge's `in`/`out` resolve *nested* field
	// access through a fetched record (`e.in.name.first`), not just `e.in` as a
	// whole. A buggy sugar returned the verb function in place of the record-link
	// field, so `e.in.name` hit `Function.prototype.name`, `.first` was
	// `undefined`, and building the projection threw "Expected object but found
	// undefined".
	test("resolves nested field access through a fetched in/out link", () => {
		const q = db
			.select("authored")
			.fetch("in", "out")
			.return((e) => ({
				user: { first: e.in.name.first, id: e.in.id },
				edge_id: e.id,
				post: { title: e.out.title, id: e.out.id },
			}));
		const sql = render(q);
		expect(sql).toContain("SELECT VALUE");
		expect(sql).toContain("$this.in.name.first");
		expect(sql).toContain("$this.in.id");
		expect(sql).toContain("$this.id");
		expect(sql).toContain("$this.out.title");
		expect(sql).toContain("$this.out.id");
		expect(sql).toContain("FETCH in, out");
	});

	test("mixes a fetched link's nested field with the edge's own field", () => {
		const q = db
			.select("authored")
			.fetch("in")
			.return((e) => ({ author: e.in.name.first, when: e.created }));
		const sql = render(q);
		expect(sql).toContain("$this.in.name.first");
		expect(sql).toContain("$this.created");
		expect(sql).toContain("FETCH in");
	});
});

describe("graph traversal — multi-table edges", () => {
	const mPost = table("post", { title: t.string() });
	const mUser = table("user", { handle: t.string() });
	const mTag = table("tag", { label: t.string() });
	const mTopic = table("topic", { name: t.string() });
	// A polymorphic edge: in ∈ {post, user}, out ∈ {tag, topic}.
	const mentioned = edge(["post", "user"], "mentioned", ["tag", "topic"], {});
	const mdb = orm(new Surreal(), mPost, mUser, mTag, mTopic, mentioned);

	type Ctx = { orm: typeof mdb; id: symbol };

	test("renders ->edge identically regardless of source table", () => {
		const fromPost = render(
			mdb.select("post").return((p) => ({ m: p.id.out("mentioned") })),
		);
		const fromUser = render(
			mdb.select("user").return((u) => ({ m: u.id.out("mentioned") })),
		);
		// The source-table union is a type/validation concern; the SurrealQL is
		// the same plain `->mentioned` from either root.
		expect(fromPost).toContain("$this.id->mentioned");
		expect(fromUser).toContain("$this.id->mentioned");
	});

	test("renders a step through the edge to a target node", () => {
		const sql = render(
			mdb
				.select("post")
				.return((p) => ({ t: p.id.out("mentioned").out("tag") })),
		);
		expect(sql).toContain("->mentioned->tag");
	});

	test("FromOf / ToOf resolve to the union of tables", () => {
		const _from: Equal<FromOf<Ctx, "mentioned">, "post" | "user"> = true;
		const _to: Equal<ToOf<Ctx, "mentioned">, "tag" | "topic"> = true;
		expect(_from && _to).toBe(true);
	});

	test("the edge is outgoing from each source and incoming to each target", () => {
		const _outPost: Equal<OutgoingEdges<Ctx, "post">, "mentioned"> = true;
		const _outUser: Equal<OutgoingEdges<Ctx, "user">, "mentioned"> = true;
		const _inTag: Equal<IncomingEdges<Ctx, "tag">, "mentioned"> = true;
		const _inTopic: Equal<IncomingEdges<Ctx, "topic">, "mentioned"> = true;
		expect(_outPost && _outUser && _inTag && _inTopic).toBe(true);
	});

	test("a multi-table edge still infers as edge record links", () => {
		const q = mdb.select("post").return((p) => ({ m: p.id.out("mentioned") }));
		type R = t.infer<typeof q>;
		const _check: Equal<R, { m: RecordId<"mentioned">[] }[]> = true;
		expect(_check).toBe(true);
	});

	test("a non-source table cannot traverse the edge", () => {
		// Never invoked — present only so `tsc` checks the @ts-expect-error case.
		const _typeErrors = () => {
			mdb.select("tag").return((tg) => ({
				// @ts-expect-error "tag" is a target of "mentioned", not a source
				x: tg.id.out("mentioned"),
			}));
		};
		expect(typeof _typeErrors).toBe("function");
	});
});
