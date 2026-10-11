import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { edge, expr, generateSchema, orm, t, table } from "../../src";
import { withTestDb } from "./setup";

const user = table("user", {
	name: t.string(),
	age: t.number().default(18),
	role: t.string().default("member"),
	created: t.date().default(expr("time::now()")),
	tags: t.array(t.string()).default([]),
	address: t.object({ city: t.string(), zip: t.string().default("00000") }),
}).computed("shout", t.string(), (row) => row.name.uppercase());

const team = table("team", { name: t.string() });
const member = edge("user", "member", "team", { role: t.string() });

describe("applying a generated schema (integration)", () => {
	const getTestDb = withTestDb({ perTest: true });

	async function apply(options?: Parameters<typeof generateSchema>[1]) {
		const { surreal } = getTestDb();
		const db = orm(surreal, user, team, member);
		const { statements } = generateSchema(db, options);
		await surreal.query(statements.map((s) => `${s.sql};`).join("\n"));
		return { surreal, db };
	}

	test("the database fills in the defaults, including nested ones", async () => {
		const { surreal } = await apply();
		await surreal.query(
			'CREATE user:a CONTENT { name: "A", address: { city: "London" } }',
		);
		const [[row]] = await surreal.query<[Record<string, unknown>[]]>(
			"SELECT * FROM user:a",
		);
		expect(row).toMatchObject({
			age: 18,
			role: "member",
			tags: [],
			address: { city: "London", zip: "00000" },
		});
		expect(row?.created).toBeDefined();
	});

	test("a required field is enforced by the database", async () => {
		const { surreal } = await apply();
		await expect(
			surreal
				.query('CREATE user:a CONTENT { address: { city: "x" } }')
				.collect(),
		).rejects.toThrow();
		await expect(
			surreal
				.query('CREATE user:b CONTENT { name: 5, address: { city: "x" } }')
				.collect(),
		).rejects.toThrow();
	});

	test("an edge only relates the tables it was declared between", async () => {
		const { surreal } = await apply();
		await surreal.query(
			'CREATE user:a CONTENT { name: "A", address: { city: "x" } }; CREATE team:t CONTENT { name: "T" };',
		);
		await surreal.query("RELATE user:a->member->team:t SET role = 'owner'");
		await expect(
			surreal
				.query("RELATE team:t->member->user:a SET role = 'owner'")
				.collect(),
		).rejects.toThrow();
		await expect(
			surreal.query("CREATE member:loose SET role = 'x'").collect(),
		).rejects.toThrow();
	});

	test("computed fields can be read once the schema is applied", async () => {
		const { surreal, db } = await apply();
		await surreal.query(
			'CREATE user:a CONTENT { name: "ada", address: { city: "x" } }',
		);
		const rows = await db.select("user");
		expect(rows[0]?.shout).toBe("ADA");
	});

	test("applying twice leaves the same schema, and keeps the data", async () => {
		const { surreal, db } = await apply();
		await surreal.query(
			'CREATE user:a CONTENT { name: "A", address: { city: "x" } }',
		);
		const { statements } = generateSchema(db);
		await surreal.query(statements.map((s) => `${s.sql};`).join("\n"));
		const [rows] = await surreal.query<[unknown[]]>("SELECT * FROM user");
		expect(rows).toHaveLength(1);
		const [info] =
			await surreal.query<[{ tables: Record<string, string> }]>("INFO FOR DB");
		expect(Object.keys(info?.tables ?? {}).sort()).toEqual([
			"member",
			"team",
			"user",
		]);
	});

	test("schemafull rejects a field the schema does not declare", async () => {
		const full = await apply({ schemafull: true });
		await expect(
			full.surreal
				.query(
					'CREATE user:a CONTENT { name: "A", address: { city: "x" }, extra: 1 }',
				)
				.collect(),
		).rejects.toThrow(/extra/);
	});

	test("schemaless keeps a field the schema does not declare", async () => {
		const { surreal } = await apply();
		await surreal.query(
			'CREATE user:a CONTENT { name: "A", address: { city: "x" }, extra: 1 }',
		);
		const [[row]] = await surreal.query<[Record<string, unknown>[]]>(
			"SELECT * FROM user:a",
		);
		expect(row).toHaveProperty("extra", 1);
	});

	test("if-not-exists leaves a definition that is already there", async () => {
		const { surreal } = getTestDb();
		await surreal.query(
			"DEFINE TABLE team SCHEMALESS; DEFINE FIELD name ON TABLE team TYPE number",
		);
		const db = orm(surreal, user, team, member);
		const { statements } = generateSchema(db, { mode: "if-not-exists" });
		await surreal.query(statements.map((s) => `${s.sql};`).join("\n"));
		// `team.name` stayed a number, as it was defined; the rest was created.
		await surreal.query("CREATE team:a CONTENT { name: 5 }");
		await expect(
			surreal.query("CREATE team:b CONTENT { name: 'x' }").collect(),
		).rejects.toThrow();
		const [info] =
			await surreal.query<[{ tables: Record<string, string> }]>("INFO FOR DB");
		expect(Object.keys(info?.tables ?? {})).toContain("user");
	});

	test("a record id written through the ORM satisfies the generated types", async () => {
		const { db } = await apply();
		const created = await db
			.create("user", "ada")
			.content({ name: "Ada", address: { city: "London", zip: "N1" } });
		expect(created[0]?.id).toBeInstanceOf(RecordId);
		expect(created[0]?.age).toBe(18);
	});
});
