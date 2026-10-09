import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import {
	and,
	count,
	edge,
	math,
	or,
	orm,
	t,
	table,
	ValidationError,
} from "../../src";
import { withTestDb } from "./setup";

/**
 * Executes the README examples that query SurrealDB, so the prose and the code
 * agree at runtime. The type-level half is in tests/readme.
 */

const user = table("user", {
	name: t.string(),
	age: t.number(),
	email: t.string(),
});
const post = table("post", { title: t.string() });
const tag = table("tag", { label: t.string() });
const authored = edge("user", "authored", "post", {
	created: t.date(),
	role: t.union([t.literal("author"), t.literal("co-author")]),
});
const tagged = edge("post", "tagged", "tag", {});

const graphSchema = [user, post, tag, authored, tagged] as const;

const seedGraph = async ({ surreal }: { surreal: Surreal }) => {
	await surreal.query(`
		CREATE user:alice SET name = "Alice", age = 30, email = "alice@example.com";
		CREATE user:bob SET name = "Bob", age = 25, email = "bob@example.com";
		CREATE user:carol SET name = "Carol", age = 40, email = "carol@example.com";
		CREATE post:post1 SET title = "First Post";
		CREATE post:post2 SET title = "Second Post";
		CREATE tag:ts SET label = "typescript";
		RELATE user:alice->authored->post:post1 SET created = time::now(), role = "author";
		RELATE user:alice->authored->post:post2 SET created = time::now(), role = "co-author";
		RELATE user:bob->authored->post:post2 SET created = time::now(), role = "author";
		RELATE post:post1->tagged->tag:ts;
	`);
};

/** The table a record id belongs to, as its name. */
const tableOf = (id: RecordId) => id.table.name;

describe("README: graph traversal", () => {
	const getTestDb = withTestDb({ setup: seedGraph });

	test("materialising with .out(edge).out(target).select() reaches the posts", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const [row] = await db
			.select("user", "alice")
			.return((user) => ({
				posts: user
					.out("authored")
					.out("post")
					.select()
					.return((post) => ({ title: post.title })),
			}))
			.execute();

		expect(row?.posts.map((p) => p.title).sort()).toEqual([
			"First Post",
			"Second Post",
		]);
	});

	test("a single .out(edge) step lands on the edge records", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const [row] = await db
			.select("user", "alice")
			.return((user) => ({ edges: user.out("authored") }))
			.execute();

		expect(row?.edges).toHaveLength(2);
		expect(row?.edges.map(tableOf)).toEqual(["authored", "authored"]);
	});

	test("a bare two-step traversal yields the post record links", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const [row] = await db
			.select("user", "alice")
			.return((user) => ({ postIds: user.out("authored").out("post") }))
			.execute();

		expect(row?.postIds.map(tableOf).sort()).toEqual(["post", "post"]);
	});

	test("multi-hop: ->authored->post->tagged->tag", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const [row] = await db
			.select("user", "alice")
			.return((user) => ({
				tags: user
					.out("authored")
					.out("post")
					.out("tagged")
					.out("tag")
					.select()
					.return((tag) => ({ label: tag.label })),
			}))
			.execute();

		expect(row?.tags).toEqual([{ label: "typescript" }]);
	});

	test("incoming: who authored this post?", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const [row] = await db
			.select("post", "post2")
			.return((post) => ({
				authors: post
					.in("authored")
					.in("user")
					.select()
					.return((user) => ({ name: user.name })),
			}))
			.execute();

		expect(row?.authors.map((u) => u.name).sort()).toEqual(["Alice", "Bob"]);
	});

	test('an edge filter inside the step: ->(authored WHERE role = "author")->post', async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const [row] = await db
			.select("user", "alice")
			.return((user) => ({
				posts: user
					.out((g) => g("authored").where((e) => e.role.eq("author")))
					.out("post")
					.select()
					.return((post) => ({ title: post.title })),
			}))
			.execute();

		expect(row?.posts).toEqual([{ title: "First Post" }]);
	});
});

describe("README: aggregates under groupAll", () => {
	const getTestDb = withTestDb({ setup: seedGraph });

	test("count(user) under groupAll", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const result = await db
			.select("user")
			.groupAll()
			.return((user) => ({ total: count(user) }))
			.execute();

		expect(result).toEqual([{ total: 3 }]);
	});

	test("math.mean, math.sum, math.max and count with a condition under groupAll", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const result = await db
			.select("user")
			.groupAll()
			.return((user) => ({
				total: count(user),
				adults: count(user, user.age.gte(18)),
				avgAge: math.mean(user.age),
				totalAge: math.sum(user.age),
				maxAge: math.max(user.age),
			}))
			.execute();

		const [agg] = result;
		expect(agg?.total).toBe(3);
		expect(agg?.adults).toBe(3);
		expect(agg?.avgAge).toBeCloseTo(95 / 3);
		expect(agg?.totalAge).toBe(95);
		expect(agg?.maxAge).toBe(40);
	});
});

describe("README: chained .where()", () => {
	const getTestDb = withTestDb({ setup: seedGraph });

	// Chained where() calls are AND-ed: each condition narrows the rows.
	test("chained where() calls are AND-ed together", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const rows = await db
			.select("user")
			.where((u) => u.age.gte(26))
			.where((u) => u.age.lt(35))
			.orderBy("name", "ASC")
			.execute();

		expect(rows.map((u) => u.name)).toEqual(["Alice"]);
	});

	// A fluent where() followed by an object where() is AND-ed too: `age >= 26` excludes Bob.
	test("a fluent where() followed by an object where() is AND-ed", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const rows = await db
			.select("user")
			.where((u) => u.age.gte(26))
			.where({ name: "Bob" })
			.execute();

		expect(rows).toEqual([]);
	});
});

describe("README: compound conditions and object filters", () => {
	// The README's examples use an object-shaped `name` (name.first), so this suite has its own user table.
	const member = table("user", {
		name: t.object({ first: t.string(), last: t.string() }),
		age: t.number(),
		email: t.string(),
		role: t.string(),
		status: t.string(),
	});

	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await surreal.query(`
				CREATE user:ada SET name = { first: "Ada", last: "Lovelace" }, age = 36, email = "ada@example.com", role = "admin", status = "active";
				CREATE user:alice SET name = { first: "Alice", last: "Smith" }, age = 17, email = "alice@example.org", role = "moderator", status = "active";
				CREATE user:bob SET name = { first: "Bob", last: "Jones" }, age = 70, email = "bob@example.com", role = "author", status = "banned";
				CREATE user:carol SET name = { first: "Carol", last: "Lee" }, age = 25, email = "carol@example.com", role = "owner", status = "active";
			`);
		},
	});

	const names = (rows: { name: { first: string } }[]) =>
		rows.map((u) => u.name.first);

	test("and() with a nested or()", async () => {
		const db = orm(getTestDb().surreal, member);

		const rows = await db
			.select("user")
			.where((user) =>
				and(
					user.age.gte(18),
					or(user.role.eq("admin"), user.role.eq("moderator")),
					user.email.endsWith("@example.com"),
				),
			)
			.execute();

		expect(names(rows)).toEqual(["Ada"]);
	});

	test("or() with several options", async () => {
		const db = orm(getTestDb().surreal, member);

		const rows = await db
			.select("user")
			.where((user) =>
				or(
					user.role.eq("admin"),
					user.role.eq("moderator"),
					user.role.eq("owner"),
				),
			)
			.orderBy("age", "ASC")
			.execute();

		expect(names(rows)).toEqual(["Alice", "Carol", "Ada"]);
	});

	test("chaining .and() on individual conditions", async () => {
		const db = orm(getTestDb().surreal, member);

		const adult = await db
			.select("user")
			.where((user) => user.age.gte(18).and(user.name.first.eq("Ada")))
			.execute();
		const none = await db
			.select("user")
			.where((user) => user.age.gte(18).and(user.name.first.eq("Alice")))
			.execute();

		expect(names(adult)).toEqual(["Ada"]);
		expect(none).toEqual([]);
	});

	test("object filter: nested field, operator ranges and a bare value", async () => {
		const db = orm(getTestDb().surreal, member);

		const rows = await db
			.select("user")
			.where({
				name: { first: "Ada" },
				email: { endsWith: "@example.com" },
				age: { gte: 18, lt: 65 },
				role: "admin",
			})
			.execute();

		expect(names(rows)).toEqual(["Ada"]);
	});

	test("object filter: or and not groups, with orderBy", async () => {
		const db = orm(getTestDb().surreal, member);

		const rows = await db
			.select("user")
			.where({
				or: [{ role: "admin" }, { age: { gt: 65 } }],
				not: { status: "banned" },
			})
			.execute();
		expect(names(rows)).toEqual(["Ada"]);

		const byAge = await db
			.select("user")
			.orderBy({ age: "desc", name: { last: "asc" } })
			.execute();
		expect(names(byAge)).toEqual(["Bob", "Ada", "Carol", "Alice"]);
	});
});

describe("README: option functions", () => {
	const profile = table("profile", {
		name: t.string(),
		bio: t.option(t.string()),
	});
	const getTestDb = withTestDb({
		setup: async ({ surreal }: { surreal: Surreal }) => {
			await surreal.query("DEFINE TABLE IF NOT EXISTS profile;");
		},
	});

	test("option map() transforms a set value, and leaves the field out when it is NONE", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, profile);
		await db
			.create("profile", "with")
			.content({ name: "W", bio: "hello" })
			.execute();
		await db.create("profile", "without").content({ name: "N" }).execute();

		const rows = await db
			.select("profile")
			.return((p) => ({
				name: p.name,
				bioUpper: p.bio.map((b) => b.uppercase()),
				bioLength: p.bio.map((b) => b.len()),
			}))
			.execute();

		const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
		expect(byName.W).toEqual({ name: "W", bioUpper: "HELLO", bioLength: 5 });
		expect(byName.N?.name).toBe("N");
		expect(byName.N?.bioUpper).toBeUndefined();
		expect(byName.N?.bioLength).toBeUndefined();
	});
});

describe("README: select().timeout", () => {
	const getTestDb = withTestDb({ setup: seedGraph });

	test("select().where().timeout('5s') returns the matching rows", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const rows = await db
			.select("user")
			.where((u) => u.age.gt(18))
			.timeout("5s")
			.execute();

		expect(rows).toHaveLength(3);
	});
});

describe("README: RELATE", () => {
	const getTestDb = withTestDb({ setup: seedGraph });

	test("relate() with content() creates the edge with its fields", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const [edge] = await db
			.relate(
				"authored",
				new RecordId("user", "bob"),
				new RecordId("post", "post1"),
			)
			.content({ created: new Date(), role: "author" });

		expect(edge?.role).toBe("author");
	});

	// The edge's required fields (created, role) are not written, so the returned
	// row leaves them out. The row must still parse.
	test("relate() without content() returns the edge", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const edges = await db.relate(
			"authored",
			new RecordId("user", "bob"),
			new RecordId("post", "post1"),
		);

		expect(edges).toHaveLength(1);
		expect(edges[0]!.in.toString()).toBe("user:bob");
		expect(edges[0]!.out.toString()).toBe("post:post1");
		expect("created" in edges[0]!).toBe(false);
	});

	test("relate().only() without content() returns the edge", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const edge = await db
			.relate(
				"authored",
				new RecordId("user", "bob"),
				new RecordId("post", "post1"),
			)
			.only();

		expect(edge.out.toString()).toBe("post:post1");
	});

	// README: "Using with query results". A select is a record source, so RELATE
	// takes its rows as the endpoints.
	test("relate() takes select queries as its endpoints", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);

		const userQuery = db.select("user", "carol");
		const postQuery = db.select("post", "post1");
		const [edge] = await db
			.relate("authored", userQuery, postQuery)
			.content({ created: new Date(), role: "author" });

		expect(edge!.in.toString()).toBe("user:carol");
		expect(edge!.out.toString()).toBe("post:post1");
		expect(edge!.role).toBe("author");
	});
});

describe("README: transactions", () => {
	const getTestDb = withTestDb({ setup: seedGraph });

	test("tx.update(user.id) updates the record inside the callback transaction", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, ...graphSchema);

		await db.transaction(async (tx) => {
			const user = await tx.create("user").only().set({
				name: "Dave",
				age: 30,
				email: "dave@example.com",
			});

			if (user.age > 25) {
				await tx.update(user.id).set({ age: 31 });
			}
		});

		const [dave] = await db
			.select("user")
			.where((u) => u.name.eq("Dave"))
			.execute();
		expect(dave?.age).toBe(31);
	});

	test("the README's old form, tx.update('user', id), is rejected", async () => {
		const db = orm(getTestDb().surreal, ...graphSchema);
		const id = new RecordId("user", "alice");

		const attempt = db.transaction(async (tx) => {
			// @ts-expect-error the two-argument form is not part of the API
			await tx.update("user", id).set({ age: 99 });
		});

		await expect(attempt).rejects.toThrow();
	});
});

describe("README: recursive traversal", () => {
	const person = table("person", { name: t.string() });
	const knows = edge("person", "knows", "person", { since: t.number() });
	const schema = [person, knows] as const;

	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			// alice -> bob -> carol -> dave, plus a cycle carol -> alice
			await surreal.query(`
				CREATE person:alice SET name = "Alice";
				CREATE person:bob SET name = "Bob";
				CREATE person:carol SET name = "Carol";
				CREATE person:dave SET name = "Dave";
				CREATE person:erin SET name = "Erin";
				RELATE person:alice->knows->person:bob SET since = 2010;
				RELATE person:bob->knows->person:carol SET since = 2015;
				RELATE person:carol->knows->person:dave SET since = 2020;
				RELATE person:carol->knows->person:alice SET since = 2021;
			`);
		},
	});

	test("recurse(n, step) returns the nodes exactly n hops away", async () => {
		const db = orm(getTestDb().surreal, ...schema);

		const [row] = await db
			.select("person", "alice")
			.return((p) => ({
				friendsOfFriends: p.recurse(2, (n) => n.out("knows").out("person")),
			}))
			.execute();

		expect(row?.friendsOfFriends.map((id) => id.id)).toEqual(["carol"]);
	});

	test("a depth range returns the nodes at the deepest level reached", async () => {
		const db = orm(getTestDb().surreal, ...schema);

		// From alice: bob (1), carol (2), dave and alice (3), bob again (4). Level 4 is the deepest reached within 4.
		const [row] = await db
			.select("person", "alice")
			.return((p) => ({
				deepest: p.recurse({ min: 1, max: 4 }, (n) =>
					n.out("knows").out("person"),
				),
			}))
			.execute();

		expect(row?.deepest.map((id) => id.id)).toEqual(["bob"]);
	});

	test("collect(step) returns every distinct node reached, and terminates on cycles", async () => {
		const db = orm(getTestDb().surreal, ...schema);

		const [row] = await db
			.select("person", "alice")
			.return((p) => ({
				network: p.collect((n) => n.out("knows").out("person")),
			}))
			.execute();

		expect(row?.network.map((id) => id.id).sort()).toEqual([
			"alice",
			"bob",
			"carol",
			"dave",
		]);
	});

	test("shortest(target, step) returns the path, and is undefined when unreachable", async () => {
		const db = orm(getTestDb().surreal, ...schema);

		const [row] = await db
			.select("person", "alice")
			.return((p) => ({
				path: p.shortest(new RecordId("person", "dave"), (n) =>
					n.out("knows").out("person"),
				),
				unreachable: p.shortest(new RecordId("person", "erin"), (n) =>
					n.out("knows").out("person"),
				),
				pathNames: p
					.shortest(new RecordId("person", "dave"), (n) =>
						n.out("knows").out("person"),
					)
					.unwrap()
					.select()
					.return((n) => ({ name: n.name })),
			}))
			.execute();

		expect(row?.path?.map((id) => id.id)).toEqual(["bob", "carol", "dave"]);
		expect(row?.unreachable).toBeUndefined();
		expect(row?.pathNames).toEqual([
			{ name: "Bob" },
			{ name: "Carol" },
			{ name: "Dave" },
		]);
	});

	test("collect returns the nearest nodes first, and inclusive adds the start", async () => {
		const db = orm(getTestDb().surreal, ...schema);

		const [row] = await db
			.select("person", "alice")
			.return((p) => ({
				network: p.collect((n) => n.out("knows").out("person")),
				withMe: p.collect({ max: 1 }, (n) => n.out("knows").out("person"), {
					inclusive: true,
				}),
			}))
			.execute();

		// alice is reached again through the cycle carol -> alice, at depth 3 with dave.
		expect(row?.network.map((id) => id.id).slice(0, 2)).toEqual([
			"bob",
			"carol",
		]);
		expect(row?.network.map((id) => id.id).sort()).toEqual([
			"alice",
			"bob",
			"carol",
			"dave",
		]);
		expect(row?.withMe.map((id) => id.id)).toEqual(["alice", "bob"]);
	});

	test("shortest with inclusive includes the start node", async () => {
		const db = orm(getTestDb().surreal, ...schema);

		const [row] = await db
			.select("person", "alice")
			.return((p) => ({
				withStart: p.shortest(
					new RecordId("person", "dave"),
					(n) => n.out("knows").out("person"),
					{
						inclusive: true,
					},
				),
			}))
			.execute();

		expect(row?.withStart?.map((id) => id.id)).toEqual([
			"alice",
			"bob",
			"carol",
			"dave",
		]);
	});

	test("shortest to the start is NONE when no cycle leads back to it", async () => {
		const db = orm(getTestDb().surreal, ...schema);

		// dave has no outgoing edges, so nothing leads back to him.
		const [row] = await db
			.select("person", "dave")
			.return((p) => ({
				self: p.shortest(
					new RecordId("person", "dave"),
					(n) => n.out("knows").out("person"),
					{
						inclusive: true,
					},
				),
			}))
			.execute();

		expect(row?.self).toBeUndefined();
	});

	test("edge filters apply inside the step", async () => {
		const db = orm(getTestDb().surreal, ...schema);

		// Only edges since 2015 or later. alice -> bob is 2010, so alice has no such step.
		const [row] = await db
			.select("person", "alice")
			.return((p) => ({
				later: p.recurse(1, (n) =>
					n
						.out((g) => g("knows").where((e) => e.since.gte(2015)))
						.out("person"),
				),
			}))
			.execute();

		expect(row?.later).toEqual([]);

		// bob -> carol (2015) -> dave (2020) and carol -> alice (2021)
		const [walk] = await db
			.select("person", "bob")
			.return((p) => ({
				later: p.recurse(2, (n) =>
					n
						.out((g) => g("knows").where((e) => e.since.gte(2015)))
						.out("person"),
				),
			}))
			.execute();

		expect(walk?.later.map((id) => id.id).sort()).toEqual(["alice", "dave"]);
	});
});

describe("README: runtime validation", () => {
	const user = table("user", {
		name: t.string(),
		age: t.number(),
		address: t.object({ city: t.string() }),
		tags: t.array(t.string()),
	});

	test("validated() reports every failing field before anything is sent", async () => {
		const surreal = new Surreal();
		const db = orm(surreal, user).validated();

		const error = await db
			.create("user")
			// @ts-expect-error the data is deliberately wrong, as the README's example is
			.content({ name: 42, address: { city: 1 }, tags: ["a", 2] })
			.then(
				() => undefined,
				(e: unknown) => e,
			);

		expect(error).toBeInstanceOf(ValidationError);
		const validation = error as ValidationError;
		expect(validation.table).toBe("user");
		expect(validation.message).toBe(
			[
				'Invalid data for table "user": 4 validation errors',
				"  - name: expected string, received 42",
				"  - age: expected number, received undefined",
				"  - address.city: expected string, received 1",
				"  - tags[1]: expected string, received 2",
			].join("\n"),
		);
		expect(validation.issues.map((i) => i.path)).toEqual([
			"name",
			"age",
			"address.city",
			"tags[1]",
		]);
	});

	test("safeParse and parse check data against the table without a database", () => {
		const bad = user.safeParse({ name: "Ada" });
		expect(bad.success).toBe(false);
		expect(() => user.parse({ name: "Ada" })).toThrow(ValidationError);

		const patch = user.safeParse({ age: 36 }, { mode: "update" });
		expect(patch.success).toBe(true);
	});

	test("issues are { path, expected, received, message }, and undeclared fields are ignored", () => {
		const result = user.safeParse({
			name: 1,
			age: 36,
			address: { city: "Rome" },
			tags: [],
			nickname: "ignored",
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues).toEqual([
			{
				path: "name",
				expected: "string",
				received: 1,
				message: "name: expected string, received 1",
			},
		]);
	});

	test("the path of a failing insert row is prefixed with its index", async () => {
		const surreal = new Surreal();
		const db = orm(surreal, user).validated();

		const error = await db
			.insert("user", [
				{ name: "Ada", age: 36, address: { city: "London" }, tags: [] },
				{ name: "Grace", age: 85, address: { city: "NY" }, tags: [] },
				// insert() does not enforce required fields (see "Which write method enforces required fields?")
				{ name: "Linus", address: { city: "Helsinki" }, tags: [] },
			])
			.then(
				() => undefined,
				(e: unknown) => e,
			);

		expect(error).toBeInstanceOf(ValidationError);
		expect((error as ValidationError).issues.map((i) => i.path)).toEqual([
			"[2].age",
		]);
	});

	test("a computed field is read-only: supplying it is an issue", () => {
		const named = table("user", {
			first: t.string(),
			last: t.string(),
		}).computed("fullName", t.string(), (row) =>
			row.first.concat(" ", row.last),
		);

		const result = named.safeParse({
			first: "Ada",
			last: "Lovelace",
			fullName: "x",
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues.map((i) => i.path)).toEqual(["fullName"]);
	});

	test('"row" mode returns an instance of the linked class', () => {
		class Person {
			given!: string;
			get label() {
				return `Dr. ${this.given}`;
			}
		}
		const person = table("person", { given: t.string() }, Person);

		const result = person.safeParse(
			{ id: new RecordId("person", "ada"), given: "Ada" },
			{ mode: "row" },
		);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data).toBeInstanceOf(Person);
		expect(result.data.label).toBe("Dr. Ada");
	});
});

describe("README: per-query validation opt-out", () => {
	const getTestDb = withTestDb();

	test(".validated(false) lets a single write through unchecked", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, user).validated();

		// return("none") skips reading the row back, which is parsed against the schema.
		await db
			.create("user", "unchecked")
			// @ts-expect-error the data is deliberately wrong; validation is switched off for this query
			.content({ name: 42, address: { city: 1 }, tags: [] })
			.validated(false)
			.return("none");

		const stored = await surreal.select<{ name: unknown }>(
			new RecordId("user", "unchecked"),
		);
		expect(stored).toMatchObject({ name: 42 });
	});
});
