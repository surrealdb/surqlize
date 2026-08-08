import { describe, expect, test } from "bun:test";
import { t, table } from "../../src";
import { diff } from "../../src/migrator/diff";
import { introspect } from "../../src/migrator/introspect";
import { migrate, plan } from "../../src/migrator/migrate";
import type { DefinableSchema } from "../../src/schema/ddl/define";
import { withTestDb } from "./setup";

describe("Indexes and events", () => {
	const db = withTestDb({
		perTest: true,
		setup: async (testDb) => {
			await testDb.surreal.query(
				"DEFINE ANALYZER eng TOKENIZERS BLANK FILTERS LOWERCASE;",
			);
		},
	});

	/** Apply a schema and return the statements that ran. */
	async function apply(schemas: DefinableSchema[]): Promise<string[]> {
		const result = await migrate(db().surreal, schemas);
		return result?.up ?? [];
	}

	test("creates every index kind, and converges", async () => {
		const post = table("post", {
			title: t.string(),
			body: t.string(),
			emb: t.array(t.float()),
		})
			.index("title_uq", { fields: ["title"], unique: true })
			.index("body_ft", {
				fields: ["body"],
				fulltext: { analyzer: "eng", highlights: true },
			})
			.index("emb_hnsw", {
				fields: ["emb"],
				hnsw: { dimension: 3, dist: "COSINE" },
			})
			.index("rows", { count: true });

		const up = await apply([post]);
		expect(up.some((s) => s.includes("FIELDS title UNIQUE"))).toBe(true);
		expect(up.some((s) => s.includes("FULLTEXT ANALYZER eng"))).toBe(true);
		expect(up.some((s) => s.includes("HNSW DIMENSION 3"))).toBe(true);
		expect(up.some((s) => s.includes("rows ON TABLE post COUNT"))).toBe(true);

		expect((await plan(db().surreal, [post])).up).toEqual([]);
	});

	test("a COUNT index takes no columns", async () => {
		// SurrealDB rejects `FIELDS a COUNT`; the index covers the table itself.
		const post = table("post", { title: t.string() }).index("rows", {
			count: true,
		});

		const up = await apply([post]);
		expect(up.some((s) => s.includes("COUNT") && s.includes("FIELDS"))).toBe(
			false,
		);
	});

	test("CONCURRENTLY does not show up as drift", async () => {
		// It is accepted but never stored, so comparing it would never converge.
		const post = table("post", { title: t.string() }).index("t_idx", {
			fields: ["title"],
			concurrently: true,
		});

		await apply([post]);
		expect((await plan(db().surreal, [post])).up).toEqual([]);
	});

	test("adds an index to an existing table", async () => {
		await apply([table("post", { title: t.string() })]);

		const withIndex = table("post", { title: t.string() }).index("t_idx", {
			fields: ["title"],
		});

		const up = (await plan(db().surreal, [withIndex])).up;
		expect(up).toHaveLength(1);
		expect(up[0]).toContain("DEFINE INDEX t_idx");
	});

	test("changing an index redefines it", async () => {
		await apply([
			table("post", { title: t.string() }).index("t_idx", {
				fields: ["title"],
			}),
		]);

		const unique = table("post", { title: t.string() }).index("t_idx", {
			fields: ["title"],
			unique: true,
		});

		const up = (await plan(db().surreal, [unique])).up;
		expect(up).toHaveLength(1);
		expect(up[0]).toContain("OVERWRITE");
		expect(up[0]).toContain("UNIQUE");
	});

	test("renaming an index redefines rather than dropping and recreating", async () => {
		await apply([
			table("post", { title: t.string() }).index("old_idx", {
				fields: ["title"],
			}),
		]);

		const renamed = table("post", { title: t.string() }).index("new_idx", {
			fields: ["title"],
			previousNames: ["old_idx"],
		});

		const up = (await plan(db().surreal, [renamed])).up;
		expect(up).toEqual([
			"DEFINE INDEX new_idx ON TABLE post FIELDS title;",
			"REMOVE INDEX old_idx ON TABLE post;",
		]);
	});

	test("an index is only removed when asked", async () => {
		await apply([
			table("post", { title: t.string() }).index("t_idx", {
				fields: ["title"],
			}),
		]);

		const bare = table("post", { title: t.string() });
		expect((await plan(db().surreal, [bare])).up).toEqual([]);

		const current = await introspect(db().surreal);
		const { up } = diff([bare], current, { removeMissing: true });
		expect(up).toEqual(["REMOVE INDEX t_idx ON TABLE post;"]);
	});

	test("an event fires on the trigger it declares", async () => {
		const post = table("post", {
			title: t.string(),
			seen: t.bool().default(false),
		}).event("mark", {
			on: "CREATE",
			body: "UPDATE $after.id SET seen = true",
		});

		await apply([post]);
		await db().surreal.query("CREATE post:1 SET title = 'hi';");

		const [rows] = await db().surreal.query<[{ seen: boolean }[]]>(
			"SELECT seen FROM post;",
		);
		expect(rows[0]?.seen).toBe(true);
	});

	test("an event with no trigger fires on every change", async () => {
		const post = table("post", { title: t.string() }).event("always", {
			body: "RETURN 1",
		});

		const up = await apply([post]);
		// `WHEN NULL` would be accepted and never fire, so it must not be emitted
		expect(up.some((s) => /WHEN\s+(null|NULL)\b/.test(s))).toBe(false);
		expect(up.some((s) => s.includes("WHEN true"))).toBe(true);
	});

	test("a trigger and a condition combine", async () => {
		const post = table("post", { title: t.string(), n: t.int() }).event("big", {
			on: ["CREATE", "UPDATE"],
			when: "$after.n > 10",
			body: "RETURN 1",
		});

		const up = await apply([post]);
		const statement = up.find((s) => s.includes("DEFINE EVENT")) ?? "";
		expect(statement).toContain('($event = "CREATE" OR $event = "UPDATE")');
		expect(statement).toContain("AND ($after.n > 10)");
	});

	test("events converge", async () => {
		const post = table("post", { title: t.string() }).event("audit", {
			on: "CREATE",
			body: "RETURN 1",
		});

		await apply([post]);
		expect((await plan(db().surreal, [post])).up).toEqual([]);
	});
});
