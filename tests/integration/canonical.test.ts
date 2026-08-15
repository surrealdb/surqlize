import { describe, expect, test } from "bun:test";
import { edge, t, table } from "../../src";
import { canonicalise } from "../../src/migrator/canonical";
import type { DefinableSchema } from "../../src/schema/ddl/define";
import { defineSchema } from "../../src/schema/ddl/define";
import { withTestDb } from "./setup";

/**
 * A generated statement and the form SurrealDB stores it as must canonicalise
 * to the same string.
 *
 * This is the property the whole migration engine rests on. If it fails for a
 * construct, a schema using that construct can never converge: every run sees a
 * difference and re-applies the same change forever.
 */
describe("Generated and stored definitions canonicalise alike", () => {
	const db = withTestDb({ perTest: true });

	/** Apply a schema, then read back what SurrealDB stored for each field. */
	async function roundTrip(
		schema: DefinableSchema,
	): Promise<{ generated: string[]; stored: Record<string, string> }> {
		const generated = defineSchema(schema);
		await db().surreal.query(generated.join("\n"));

		const [info] = await db().surreal.query<
			[{ fields: Record<string, string> }]
		>(`INFO FOR TABLE ${schema.tb};`);

		return { generated, stored: info.fields };
	}

	/** Assert every generated field statement matches its stored counterpart. */
	async function expectConvergence(schema: DefinableSchema) {
		const { generated, stored } = await roundTrip(schema);

		for (const statement of generated) {
			const match = statement.match(/DEFINE FIELD (\S+) ON TABLE/);
			if (!match) continue; // the DEFINE TABLE statement

			const name = (match[1] as string).replace(/\[\*\]/g, ".*");
			const storedStatement = stored[name];

			expect(storedStatement, `no stored field for ${name}`).toBeDefined();
			expect(canonicalise(statement), `field ${name}`).toBe(
				canonicalise(storedStatement as string),
			);
		}
	}

	test("scalars", async () => {
		await expectConvergence(
			table("scalars", {
				s: t.string(),
				i: t.int(),
				f: t.float(),
				d: t.decimal(),
				b: t.bool(),
				dt: t.date(),
				u: t.uuid(),
				dur: t.duration(),
				by: t.bytes(),
				a: t.any(),
			}),
		);
	});

	test("optional types, which are stored as a union with none", async () => {
		await expectConvergence(
			table("opts", {
				a: t.option(t.string()),
				b: t.option(t.array(t.option(t.record("user")))),
				c: t.option(t.int()),
			}),
		);
	});

	test("collections and links", async () => {
		await expectConvergence(
			table("colls", {
				tags: t.array(t.string()),
				uniq: t.set(t.string()),
				one: t.record("user"),
				many: t.record(["post", "user"]),
				anyLink: t.record(),
			}),
		);
	});

	test("literals, unions and geometry", async () => {
		await expectConvergence(
			table("shapes", {
				status: t.union([t.literal("on"), t.literal("off")]),
				only: t.literal("fixed"),
				loc: t.geometry("point"),
				anyGeo: t.geometry(),
				r: t.range(),
			}),
		);
	});

	test("every field modifier", async () => {
		await expectConvergence(
			table("mods", {
				assertOne: t.string().assert("string::len($value) > 2"),
				assertMany: t.string().assert("$value != ''").assert("$value != 'x'"),
				withDefault: t.int().default(0),
				stringDefault: t.string().default("active"),
				exprDefault: t.date().default("time::now()"),
				alwaysDefault: t.date().defaultAlways("time::now()"),
				valued: t.string().valueExpr("string::lowercase($value)"),
				readonlyField: t.string().readonly(),
				flexi: t.object({ x: t.string() }).flexible(),
				commented: t.string().comment("A comment"),
			}),
		);
	});

	test("nested objects at every level", async () => {
		await expectConvergence(
			table("nested", {
				addr: t.object({ street: t.string(), geo: t.object({ x: t.int() }) }),
				optObj: t.option(t.object({ bio: t.string() })),
				items: t.array(t.object({ sku: t.string() })),
			}),
		);
	});

	test("a declared id", async () => {
		await expectConvergence(
			table("docs", {
				id: t.uuid().default("rand::uuid::v7()"),
				title: t.string(),
			}),
		);
	});

	test("an edge's own fields", async () => {
		await db().surreal.query(
			"DEFINE TABLE user SCHEMAFULL; DEFINE TABLE post SCHEMAFULL;",
		);
		await expectConvergence(
			edge("user", "authored", "post", {
				at: t.date().default("time::now()"),
				weight: t.option(t.float()),
			}),
		);
	});
});
