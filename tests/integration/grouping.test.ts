import { describe, expect, test } from "bun:test";
import { count, math, orm, t, table } from "../../src";
import { seedTestData } from "../helpers/db";
import { withTestDb } from "./setup";

const article = table("article", {
	title: t.string(),
	author: t.string(),
	tags: t.array(t.string()),
	rating: t.number(),
});

// The seeded user table (see seedTestData), so the README's user examples run.
const user = table("user", {
	name: t.object({ first: t.string(), last: t.string() }),
	age: t.number(),
	email: t.string(),
	created: t.date(),
	updated: t.date(),
});

describe("GROUP BY, GROUP ALL and SPLIT with return()", () => {
	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await seedTestData(surreal);
			await surreal.query(`
				CREATE article:1 SET title = "A", author = "ann", tags = ["x", "y"], rating = 4;
				CREATE article:2 SET title = "B", author = "ann", tags = ["y"], rating = 2;
				CREATE article:3 SET title = "C", author = "bob", tags = ["z"], rating = 5;
			`);
		},
	});

	describe("GROUP ALL", () => {
		test("aggregate projections (README example) execute", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, article, user);
			// The README example, against the seeded user table (ages 30, 25, 35).
			const [stats] = await db
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

			expect(stats).toEqual({
				total: 3,
				adults: 3,
				avgAge: 30,
				totalAge: 90,
				maxAge: 35,
			});
		});

		test("a single aggregate returns a scalar", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, article, user);
			const counts = await db
				.select("article")
				.groupAll()
				.return((a) => count(a))
				.execute();
			expect(counts).toEqual([3]);
		});

		test("a filtered single aggregate returns a scalar", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, article, user);
			const means = await db
				.select("article")
				.where((a) => a.author.eq("ann"))
				.groupAll()
				.return((a) => math.mean(a.rating))
				.execute();
			expect(means).toEqual([3]);
		});
	});

	describe("GROUP BY", () => {
		test("groups with aggregates", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, article, user);
			const rows = await db
				.select("article")
				.groupBy("author")
				.return((a) => ({
					author: a.author,
					posts: count(a),
					avgRating: math.mean(a.rating),
				}))
				.execute();

			const byAuthor = Object.fromEntries(rows.map((r) => [r.author, r]));
			expect(byAuthor.ann).toEqual({ author: "ann", posts: 2, avgRating: 3 });
			expect(byAuthor.bob).toEqual({ author: "bob", posts: 1, avgRating: 5 });
		});

		test("a grouped key can be selected under an alias", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, article, user);
			const rows = await db
				.select("article")
				.groupBy("author")
				.return((a) => ({ writer: a.author, posts: count(a) }))
				.execute();

			const byWriter = Object.fromEntries(rows.map((r) => [r.writer, r.posts]));
			expect(byWriter).toEqual({ ann: 2, bob: 1 });
		});

		test("groups with a WHERE clause", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, article, user);
			const rows = await db
				.select("article")
				.where((a) => a.rating.gte(3))
				.groupBy("author")
				.return((a) => ({ author: a.author, posts: count(a) }))
				.execute();
			expect(rows).toEqual([
				{ author: "ann", posts: 1 },
				{ author: "bob", posts: 1 },
			]);
		});
	});

	describe("SPLIT", () => {
		test("splits an array field into one row per element", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, article, user);
			const rows = await db
				.select("article")
				.split("tags")
				.return((a) => ({ tag: a.tags, title: a.title }))
				.execute();

			const pairs = rows.map((r) => `${r.tag}:${r.title}`).sort();
			expect(pairs).toEqual(["x:A", "y:A", "y:B", "z:C"]);
		});

		test("splits with no projection, each row holding one element", async () => {
			const { surreal } = getTestDb();
			const articles = orm(surreal, article, user);
			const rows = await articles.select("article").split("tags").execute();

			// The field is typed as its element, so it parses as a string.
			expect(rows.map((r) => r.tags).sort()).toEqual(["x", "y", "y", "z"]);
		});

		test("splits after a WHERE clause", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, article, user);
			const rows = await db
				.select("article")
				.where((a) => a.rating.gte(4))
				.split("tags")
				.return((a) => ({ tag: a.tags }))
				.execute();

			expect(rows.map((r) => r.tag).sort()).toEqual(["x", "y", "z"]);
		});
	});
});
