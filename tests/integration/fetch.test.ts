import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { edge, orm, t, table } from "../../src";
import { withTestDb } from "./setup";

// Reproduces https://github.com/surrealdb/surqlize/issues/22 — fetching nested
// record references such as `out` and `out.author` on an edge table.
describe("nested FETCH integration tests", () => {
	const author = table("author", {
		name: t.string(),
	});

	const product = table("product", {
		title: t.string(),
		author: t.record("author"),
	});

	const purchased = edge("user", "purchased", "product", {
		moment: t.date(),
	});

	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await surreal.query(`
				CREATE author:alice SET name = "Alice";
				CREATE product:widget SET title = "Widget", author = author:alice;
				RELATE user:bob->purchased->product:widget SET moment = time::now();
			`);
		},
	});

	test("resolves nested record references (out, out.author)", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, author, product, purchased);

		const result = await db
			.select("purchased")
			.fetch("out", "out.author")
			.execute();

		expect(result.length).toBe(1);
		const row = result[0]!;

		// `out` is expanded into the full product object
		expect(row.out.title).toBe("Widget");
		// `out.author` is expanded into the full author object
		expect(row.out.author.name).toBe("Alice");
		// `in` is left as a record link
		expect(row.in).toBeInstanceOf(RecordId);
		expect(String(row.in)).toBe("user:bob");
	});

	test("fetching only `out` leaves the nested author as a record link", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, author, product, purchased);

		const result = await db.select("purchased").fetch("out").execute();

		expect(result.length).toBe(1);
		const out = result[0]!.out;
		expect(out.title).toBe("Widget");
		// Not fetched -> remains a RecordId
		expect(out.author).toBeInstanceOf(RecordId);
		expect(String(out.author)).toBe("author:alice");
	});
});
