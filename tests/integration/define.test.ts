import { describe, expect, test } from "bun:test";
import { edge, t, table } from "../../src";
import { defineSchema } from "../../src/schema/ddl/define";
import { withTestDb } from "./setup";

/**
 * Generated DDL has to be executed to be trusted.
 *
 * A statement with a misplaced clause or an invented keyword reads perfectly
 * well as a string and only fails when a migration runs against a real server.
 */
describe("Generated DDL applies to SurrealDB", () => {
	const db = withTestDb({ perTest: true });

	/** Run every statement, then read the table's fields back. */
	async function apply(statements: string[]): Promise<Record<string, string>> {
		await db().surreal.query(statements.join("\n"));
		const [info] = await db().surreal.query<
			[{ fields: Record<string, string> }]
		>(`INFO FOR TABLE ${tableNameOf(statements[0] as string)};`);
		return info.fields;
	}

	function tableNameOf(defineTable: string): string {
		return defineTable.split(" ")[2] as string;
	}

	test("a table with every field modifier", async () => {
		const user = table("user", {
			name: t
				.string()
				.assert("string::len($value) > 2")
				.comment("Display name"),
			email: t.string().assert("string::is_email($value)"),
			age: t.int().default(0),
			createdAt: t.date().defaultAlways("time::now()").readonly(),
			slug: t.string().computed("string::lowercase($this.name)"),
			meta: t.object({ tier: t.string() }).flexible(),
			bio: t.option(t.string()).permissions("FULL"),
		})
			.schemafull()
			.comment("People");

		const fields = await apply(defineSchema(user));

		expect(fields.name).toContain("ASSERT string::len($value) > 2");
		expect(fields.name).toContain("COMMENT");
		expect(fields.age).toContain("DEFAULT 0");
		expect(fields.createdAt).toContain("DEFAULT ALWAYS time::now()");
		expect(fields.createdAt).toContain("READONLY");
		expect(fields.slug).toContain("VALUE");
		expect(fields.meta).toContain("FLEXIBLE");
	});

	test("several asserts combine into one clause", async () => {
		const post = table("post", {
			title: t
				.string()
				.assert("string::len($value) > 0")
				.assert("string::len($value) < 200"),
		});

		const fields = await apply(defineSchema(post));
		expect(fields.title).toContain("AND");
	});

	test("a string default is quoted but an expression is not", async () => {
		const thing = table("thing", {
			status: t.string().default("active"),
			at: t.date().default("time::now()"),
		});

		const fields = await apply(defineSchema(thing));
		expect(fields.status).toContain("DEFAULT 'active'");
		expect(fields.at).toContain("DEFAULT time::now()");
	});

	test("nested objects become dotted fields, parent included", async () => {
		const person = table("person", {
			address: t.object({
				street: t.string(),
				city: t.string(),
			}),
		});

		const statements = defineSchema(person);
		expect(statements).toContain(
			"DEFINE FIELD address ON TABLE person TYPE object;",
		);
		expect(statements).toContain(
			"DEFINE FIELD address.street ON TABLE person TYPE string;",
		);

		const fields = await apply(statements);
		expect(fields.address).toContain("TYPE object");
		expect(fields["address.street"]).toContain("TYPE string");
	});

	test("objects nested arbitrarily deep", async () => {
		const deep = table("deep", {
			a: t.object({ b: t.object({ c: t.string() }) }),
		});

		const fields = await apply(defineSchema(deep));
		expect(fields["a.b.c"]).toContain("TYPE string");
	});

	test("an optional object still defines its children", async () => {
		const maybe = table("maybe", {
			profile: t.option(t.object({ bio: t.string() })),
		});

		const fields = await apply(defineSchema(maybe));
		expect(fields.profile).toContain("none | object");
		expect(fields["profile.bio"]).toContain("TYPE string");
	});

	test("objects inside an array use the element wildcard", async () => {
		const cart = table("cart", {
			items: t.array(t.object({ sku: t.string(), qty: t.int() })),
		});

		const statements = defineSchema(cart);
		expect(statements).toContain(
			"DEFINE FIELD items[*].sku ON TABLE cart TYPE string;",
		);
		// The element field itself is SurrealDB's to create
		expect(statements.some((s) => s.includes("items[*] ON"))).toBe(false);

		const fields = await apply(statements);
		expect(fields["items[*].sku"] ?? fields["items.*.sku"]).toBeDefined();
	});

	test("a schemaless table with permissions and a changefeed", async () => {
		const loose = table("loose", { anything: t.any() })
			.schemaless()
			.permissions({ select: "FULL", create: "NONE" })
			.changefeed("1d", true);

		const statements = defineSchema(loose);
		expect(statements[0]).toContain("SCHEMALESS");
		expect(statements[0]).toContain("FOR select FULL");
		expect(statements[0]).toContain("CHANGEFEED 1d INCLUDE ORIGINAL");

		await db().surreal.query(statements.join("\n"));
		const [info] =
			await db().surreal.query<[{ tables: Record<string, string> }]>(
				"INFO FOR DB;",
			);
		expect(info.tables.loose).toContain("SCHEMALESS");
	});

	test("an edge defines as a relation without redefining in and out", async () => {
		const authored = edge("user", "authored", "post", {
			at: t.date().default("time::now()"),
		}).enforced();

		const statements = defineSchema(authored);
		expect(statements[0]).toContain("TYPE RELATION IN user OUT post");
		expect(statements[0]).toContain("ENFORCED");
		expect(statements.some((s) => s.includes("FIELD in ON"))).toBe(false);
		expect(statements.some((s) => s.includes("FIELD out ON"))).toBe(false);

		// The referenced tables must exist for an enforced relation
		await db().surreal.query(
			"DEFINE TABLE user SCHEMAFULL; DEFINE TABLE post SCHEMAFULL;",
		);
		const fields = await apply(statements);
		expect(fields.at).toContain("DEFAULT time::now()");
	});

	test("an edge across several source and target tables", async () => {
		const tagged = edge(["post", "user"], "tagged", "tag", {});
		expect(defineSchema(tagged)[0]).toContain(
			"TYPE RELATION IN post | user OUT tag",
		);

		await db().surreal.query(
			"DEFINE TABLE post SCHEMAFULL; DEFINE TABLE user SCHEMAFULL; DEFINE TABLE tag SCHEMAFULL;",
		);
		await db().surreal.query(defineSchema(tagged).join("\n"));
	});

	test("the injected id is never defined", async () => {
		// SurrealDB manages `id` and rejects `TYPE record<tb>` on it outright.
		const plain = table("plain", { name: t.string() });
		expect(defineSchema(plain).some((s) => s.includes("FIELD id ON"))).toBe(
			false,
		);
		await apply(defineSchema(plain));
	});

	test("a declared id is defined", async () => {
		const doc = table("doc", {
			id: t.uuid().default("rand::uuid::v7()"),
			title: t.string(),
		});

		const fields = await apply(defineSchema(doc));
		expect(fields.id).toContain("TYPE uuid");
		// SurrealDB backticks the function namespace when it stores the default
		expect(fields.id).toMatch(/DEFAULT `?rand`?::uuid::v7\(\)/);
	});
});
