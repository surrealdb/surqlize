import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
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
		label: t.string(),
		author: t.record("author"),
	});

	const purchased = edge("user", "purchased", "product", {
		moment: t.date(),
	});

	const comment = table("comment", {
		body: t.string(),
		label: t.string(),
	});

	const notification = table("notification", {
		target: t.union([t.record("product"), t.record("comment")]),
	});

	const multiTableNotification = table("multi_table_notification", {
		target: t.record(["product", "comment"]),
	});

	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await surreal.query(`
				CREATE author:alice SET name = "Alice";
				CREATE product:widget SET title = "Widget", label = "Product", author = author:alice;
				CREATE comment:welcome SET body = "Welcome!", label = "Comment";
				CREATE notification:product SET target = product:widget;
				CREATE notification:comment SET target = comment:welcome;
				CREATE multi_table_notification:product SET target = product:widget;
				CREATE multi_table_notification:comment SET target = comment:welcome;
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

	test("fetches polymorphic notification targets", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, author, product, purchased, comment, notification);

		const result = await db.select("notification").fetch("target").execute();

		expect(result).toHaveLength(2);
		expect(
			result.some(
				({ target }) => "title" in target && target.title === "Widget",
			),
		).toBe(true);
		expect(
			result.some(
				({ target }) => "body" in target && target.body === "Welcome!",
			),
		).toBe(true);
	});

	test("fetches multi-table record targets", async () => {
		const { surreal } = getTestDb();
		const db = orm(
			surreal,
			author,
			product,
			purchased,
			comment,
			multiTableNotification,
		);

		const result = await db
			.select("multi_table_notification")
			.fetch("target")
			.execute();

		expect(result).toHaveLength(2);
		expect(
			result.some(
				({ target }) => "title" in target && target.title === "Widget",
			),
		).toBe(true);
		expect(
			result.some(
				({ target }) => "body" in target && target.body === "Welcome!",
			),
		).toBe(true);
	});

	test("projects fields from fetched multi-table record targets", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, author, product, comment, multiTableNotification);

		const result = await db
			.select("multi_table_notification")
			.fetch("target")
			.return((row) => ({ label: row.target.label }))
			.execute();

		expect(result.map(({ label }) => label).sort()).toEqual([
			"Comment",
			"Product",
		]);
	});

	test("infers fields from both polymorphic FETCH forms", () => {
		const db = orm(
			new Surreal(),
			author,
			product,
			comment,
			notification,
			multiTableNotification,
		);
		const unionQuery = db
			.select("notification")
			.fetch("target", "target.author");
		type UnionRow = t.infer<typeof unionQuery>[number];
		const assertUnion = (row: UnionRow) => {
			if ("title" in row.target) {
				const title: string = row.target.title;
				const authorName: string = row.target.author.name;
				return [title, authorName];
			}
			const body: string = row.target.body;
			return [body];
		};

		const multiTableQuery = db
			.select("multi_table_notification")
			.fetch("target", "target.author");
		type MultiTableRow = t.infer<typeof multiTableQuery>[number];
		const assertMultiTable = (row: MultiTableRow) => {
			if ("title" in row.target) {
				const title: string = row.target.title;
				const authorName: string = row.target.author.name;
				return [title, authorName];
			}
			const body: string = row.target.body;
			return [body];
		};

		expect(typeof assertUnion).toBe("function");
		expect(typeof assertMultiTable).toBe("function");
	});
});

// Reproduces https://github.com/surrealdb/surqlize/issues/60 — fetching a typed
// record link whose target table is not registered with the ORM.
describe("FETCH of a link to an unregistered table", () => {
	const workspace = table("workspace", {
		name: t.string(),
	});
	const memberOf = edge("user", "member_of", "workspace", {
		role: t.string(),
	});

	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await surreal.query(`
				CREATE workspace:ws1 SET name = "Acme";
				RELATE user:bob->member_of->workspace:ws1 SET role = "admin";
			`);
		},
	});

	test("decodes the fetched record when its table is registered", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, workspace, memberOf);

		const result = await db.select("member_of").fetch("out").execute();

		expect(result).toHaveLength(1);
		expect(result[0]!.out.name).toBe("Acme");
	});

	test("does not reject the fetched record when its table is not registered", async () => {
		const { surreal } = getTestDb();
		const db = orm(surreal, memberOf);

		const result = await db.select("member_of").fetch("out").execute();

		expect(result).toHaveLength(1);
		expect(result[0]!.role).toBe("admin");
		expect(result[0]!.out).toMatchObject({ name: "Acme" });
	});
});
