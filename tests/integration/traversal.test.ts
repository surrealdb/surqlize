import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { edge, orm, t, table } from "../../src";
import { withTestDb } from "./setup";

describe("graph traversal integration tests", () => {
	const user = table("user", {
		name: t.object({ first: t.string(), last: t.string() }),
		age: t.number(),
	});
	const post = table("post", { title: t.string() });
	const tag = table("tag", { label: t.string() });
	const authored = edge("user", "authored", "post", { created: t.date() });
	const tagged = edge("post", "tagged", "tag", {});

	const schema = [user, post, tag, authored, tagged] as const;

	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await surreal.query(`
				CREATE user:alice SET name = { first: "Alice", last: "Smith" }, age = 30;
				CREATE user:bob   SET name = { first: "Bob", last: "Jones" }, age = 25;
				CREATE user:carol SET name = { first: "Carol", last: "Lee" }, age = 40;
				CREATE post:post1 SET title = "First Post";
				CREATE post:post2 SET title = "Second Post";
				CREATE tag:ts SET label = "typescript";
				RELATE user:alice->authored->post:post1 SET created = time::now();
				RELATE user:bob->authored->post:post2 SET created = time::now();
				RELATE post:post1->tagged->tag:ts;
			`);
		},
	});

	test("outgoing single hop, projected via .select()", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("user", "alice")
			.return((u) => ({
				posts: u.id
					.out("authored")
					.select()
					.return((p) => ({ title: p.title })),
			}))
			.execute();

		expect(result).toEqual([{ posts: [{ title: "First Post" }] }]);
	});

	test("incoming single hop, projected via .select()", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("post", "post1")
			.return((p) => ({
				authors: p.id
					.in("authored")
					.select()
					.return((u) => ({
						first: u.name.first,
					})),
			}))
			.execute();

		expect(result).toEqual([{ authors: [{ first: "Alice" }] }]);
	});

	test("bare traversal yields record links", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("user", "alice")
			.return((u) => ({ posts: u.id.out("authored") }))
			.execute();

		expect(result.length).toBe(1);
		const posts = result[0]!.posts;
		expect(posts.length).toBe(1);
		expect(posts[0]).toBeInstanceOf(RecordId);
		expect(String(posts[0])).toBe("post:post1");
	});

	test("multi-hop chaining ->authored->post->tagged->tag", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("user", "alice")
			.return((u) => ({
				tags: u.id
					.out("authored")
					.out("tagged")
					.select()
					.return((tg) => ({ label: tg.label })),
			}))
			.execute();

		expect(result).toEqual([{ tags: [{ label: "typescript" }] }]);
	});

	test("empty traversal yields an empty array", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("user", "carol")
			.return((u) => ({ posts: u.id.out("authored") }))
			.execute();

		expect(result).toEqual([{ posts: [] }]);
	});

	test("outEdge lands on the edge and exposes its fields", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("user", "alice")
			.return((u) => ({
				edges: u.id
					.outEdge("authored")
					.select()
					.return((e) => ({
						when: e.created,
					})),
			}))
			.execute();

		expect(result.length).toBe(1);
		const edges = result[0]!.edges;
		expect(edges.length).toBe(1);
		expect(edges[0]!.when).toBeInstanceOf(Date);
	});

	test("inEdge lands on the incoming edge and exposes its fields", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("post", "post1")
			.return((p) => ({
				edges: p.id
					.inEdge("authored")
					.select()
					.return((e) => ({
						when: e.created,
					})),
			}))
			.execute();

		expect(result[0]!.edges[0]!.when).toBeInstanceOf(Date);
	});

	test("WHERE: array::len filters to nodes with a traversal", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("user")
			.where((u) => u.id.out("authored").len().gt(0))
			.return((u) => ({ first: u.name.first }))
			.execute();

		expect(result.map((r) => r.first).sort()).toEqual(["Alice", "Bob"]);
	});

	test("WHERE: array::is_empty filters to nodes without a traversal", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("user")
			.where((u) => u.id.out("authored").isEmpty())
			.return((u) => ({ first: u.name.first }))
			.execute();

		expect(result.map((r) => r.first)).toEqual(["Carol"]);
	});

	test("row-level sugar (user.out without .id)", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("user", "alice")
			.return((u) => ({
				posts: u
					.out("authored")
					.select()
					.return((p) => ({ title: p.title })),
			}))
			.execute();

		expect(result).toEqual([{ posts: [{ title: "First Post" }] }]);
	});
});

describe("graph traversal — edge filtering", () => {
	const user = table("user", { name: t.string() });
	const post = table("post", { title: t.string() });
	const authored = edge("user", "authored", "post", { role: t.string() });
	const schema = [user, post, authored] as const;

	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await surreal.query(`
				CREATE user:dave SET name = "Dave";
				CREATE post:p1 SET title = "Authored";
				CREATE post:p2 SET title = "Edited";
				RELATE user:dave->authored->post:p1 SET role = "author";
				RELATE user:dave->authored->post:p2 SET role = "editor";
			`);
		},
	});

	test("->(edge WHERE …)->target filters by edge field", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("user", "dave")
			.return((u) => ({
				authored: u.id
					.out("authored", { where: (e) => e.role.eq("author") })
					.select()
					.return((p) => ({ title: p.title })),
			}))
			.execute();

		expect(result).toEqual([{ authored: [{ title: "Authored" }] }]);
	});

	test("without a filter, all edges traverse", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("user", "dave")
			.return((u) => ({ posts: u.id.out("authored") }))
			.execute();

		expect(result[0]!.posts.length).toBe(2);
	});
});

describe("graph traversal — recursive / path finding", () => {
	const person = table("person", { name: t.string() });
	const knows = edge("person", "knows", "person", {});
	const schema = [person, knows] as const;

	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await surreal.query(`
				CREATE person:alice, person:bob, person:carol, person:dave;
				RELATE person:alice->knows->person:bob;
				RELATE person:bob->knows->person:carol;
				RELATE person:carol->knows->person:dave;
			`);
		},
	});

	const ids = (arr: { id: unknown }[] | RecordId[]) =>
		(arr as RecordId[]).map((r) => String(r));

	test("exact depth lands on the node at that depth", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("person", "alice")
			.return((p) => ({ net: p.out("knows", { depth: 2 }) }))
			.execute();

		expect(ids(result[0]!.net)).toEqual(["person:carol"]);
	});

	test("collect gathers every node along the recursion", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("person", "alice")
			.return((p) => ({ net: p.out("knows", { collect: true }) }))
			.execute();

		expect(ids(result[0]!.net).sort()).toEqual([
			"person:bob",
			"person:carol",
			"person:dave",
		]);
	});

	test("shortest finds the path to a target record", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...schema);

		const result = await db
			.select("person", "alice")
			.return((p) => ({
				path: p.out("knows", { shortest: new RecordId("person", "dave") }),
			}))
			.execute();

		expect(ids(result[0]!.path)).toEqual([
			"person:bob",
			"person:carol",
			"person:dave",
		]);
	});
});
