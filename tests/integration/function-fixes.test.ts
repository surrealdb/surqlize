import { describe, expect, test } from "bun:test";
import { Duration, Uuid } from "surrealdb";
import { and, duration, orm, rand, search, t, table, vector } from "../../src";
import { withTestDb } from "./setup";

const note = table("note", {
	title: t.string(),
	body: t.string(),
	bio: t.option(t.string()),
	embedding: t.array(t.number()),
	secs: t.number(),
});

describe("function fixes against a live server", () => {
	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await surreal.query(`
				DEFINE ANALYZER IF NOT EXISTS note_analyzer
					TOKENIZERS blank, class
					FILTERS lowercase, ascii;
				DEFINE INDEX IF NOT EXISTS note_title_search
					ON TABLE note FIELDS title FULLTEXT ANALYZER note_analyzer BM25 HIGHLIGHTS;
				DEFINE INDEX IF NOT EXISTS note_body_search
					ON TABLE note FIELDS body FULLTEXT ANALYZER note_analyzer BM25 HIGHLIGHTS;

				CREATE note:a SET
					title = "hello world",
					body = "surreal is great",
					bio = "hello there",
					embedding = [1, 0, 0],
					secs = 90;
				CREATE note:b SET
					title = "rust surreal database",
					body = "graph database in rust",
					embedding = [0, 1, 0],
					secs = 30;
				CREATE note:c SET
					title = "rust rust rust rust",
					body = "rust",
					embedding = [0, 0, 1],
					secs = 5;
				CREATE note:d SET
					title = "python",
					body = "rust is fast",
					embedding = [1, 1, 0],
					secs = 1;
			`);
		},
	});

	describe("option.map()", () => {
		test("maps a present value and yields NONE for an absent one", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, note);

			const rows = await db
				.select("note")
				.return((n) => ({
					id: n.id,
					shout: n.bio.map((b) => b.uppercase()),
				}))
				.execute();

			const byId = Object.fromEntries(rows.map((r) => [r.id.id, r.shout]));
			expect(byId.a).toBe("HELLO THERE");
			// `note:b` has no bio, so the mapped value is absent too.
			expect(byId.b).toBeUndefined();
		});
	});

	describe("full-text match references", () => {
		test("search() with a match reference filters rows", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, note);

			const rows = await db
				.select("note")
				.where((n) => n.title.search("hello", 1))
				.execute();

			expect(rows.map((r) => r.id.id)).toEqual(["a"]);
		});

		test("search.score() reads the score of a numbered match", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, note);

			const rows = await db
				.select("note")
				.where((n) => n.title.search("hello", 1))
				.return((n) => ({
					id: n.id,
					score: search.score(n.title, 1),
				}))
				.execute();

			expect(rows).toHaveLength(1);
			expect(rows[0]?.score).toBeGreaterThan(0);
		});

		test("two numbered matches have independent scores", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, note);

			const rows = await db
				.select("note")
				.where((n) =>
					and(n.title.search("hello", 1), n.body.search("surreal", 2)),
				)
				.return((n) => ({
					id: n.id,
					titleScore: search.score(n.title, 1),
					bodyScore: search.score(n.body, 2),
				}))
				.execute();

			expect(rows.map((r) => r.id.id)).toEqual(["a"]);
			const [row] = rows;
			expect(row?.titleScore).toBeGreaterThan(0);
			expect(row?.bodyScore).toBeGreaterThan(0);
			// The two scores come from different predicates, so they differ.
			expect(row?.titleScore).not.toBe(row?.bodyScore);
		});

		test("search.highlight() wraps the matched term", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, note);

			const rows = await db
				.select("note")
				.where((n) => n.title.search("hello", 1))
				.return((n) => ({
					highlighted: search.highlight(n.title, "<b>", "</b>", 1),
				}))
				.execute();

			expect(rows[0]?.highlighted).toBe("<b>hello</b> world");
		});

		test("search.offsets() reports the byte span of the match", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, note);

			const rows = await db
				.select("note")
				.where((n) => n.title.search("hello", 1))
				.return((n) => ({
					offsets: search.offsets(n.title, 1),
				}))
				.execute();

			const spans = Object.values(rows[0]?.offsets ?? {});
			expect(spans).toEqual([[{ s: 0, e: 5 }]]);
		});

		test("search.analyze() returns the token array", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, note);

			const rows = await db
				.select("note")
				.where((n) => n.title.search("hello", 1))
				.return((n) => ({
					tokens: search.analyze(db.value("note_analyzer"), n.title),
				}))
				.execute();

			expect(rows[0]?.tokens).toEqual(["hello", "world"]);
		});
	});

	describe("vector literals", () => {
		test("a plain array argument works next to a field", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, note);

			const rows = await db
				.select("note")
				.return((n) => ({
					id: n.id,
					similarity: vector.similarityCosine(n.embedding, [1, 0, 0]),
				}))
				.execute();

			const byId = Object.fromEntries(rows.map((r) => [r.id.id, r.similarity]));
			expect(byId.a).toBeCloseTo(1);
			expect(byId.b).toBeCloseTo(0);
		});

		test("a plain array can come first", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, note);

			const rows = await db
				.select("note")
				.where((n) => n.title.search("hello", 1))
				.return((n) => ({
					dot: vector.dot([1, 2, 3], n.embedding),
				}))
				.execute();

			// [1, 2, 3] . [1, 0, 0]
			expect(rows[0]?.dot).toBe(1);
		});

		test("vector operations that return vectors give number arrays", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, note);

			const rows = await db
				.select("note")
				.where((n) => n.title.search("hello", 1))
				.return((n) => ({
					sum: vector.add(n.embedding, [1, 1, 1]),
				}))
				.execute();

			expect(rows[0]?.sum).toEqual([2, 1, 1]);
		});
	});

	describe("return types of standalone functions", () => {
		test("rand.uuid() rows parse into Uuid instances", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, note);

			const rows = await db
				.select("note")
				.return((n) => ({
					id: rand.uuid(n),
				}))
				.execute();

			expect(rows.length).toBeGreaterThan(0);
			for (const row of rows) {
				expect(row.id).toBeInstanceOf(Uuid);
			}
		});

		test("duration.fromSecs() rows parse into Duration instances", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, note);

			const rows = await db
				.select("note")
				.where((n) => n.title.search("hello", 1))
				.return((n) => ({
					length: duration.fromSecs(n.secs),
				}))
				.execute();

			expect(rows[0]?.length).toBeInstanceOf(Duration);
		});
	});
});
