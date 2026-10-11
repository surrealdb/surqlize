import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import {
	edge,
	expr,
	generateSchema,
	orm,
	t,
	table,
	toSurql,
} from "../../../src";

const sql = (...tables: unknown[]) =>
	generateSchema(orm(new Surreal(), ...(tables as never[]))).statements.map(
		(s) => s.sql,
	);

describe("generateSchema", () => {
	test("a table, then each field with its type", () => {
		const user = table("user", {
			name: t.string(),
			nick: t.option(t.string()),
			born: t.date(),
			friend: t.option(t.record("user")),
		});
		expect(sql(user)).toEqual([
			"DEFINE TABLE OVERWRITE user TYPE NORMAL SCHEMAFULL;",
			"DEFINE FIELD OVERWRITE name ON TABLE user TYPE string;",
			"DEFINE FIELD OVERWRITE nick ON TABLE user TYPE option<string>;",
			"DEFINE FIELD OVERWRITE born ON TABLE user TYPE datetime;",
			"DEFINE FIELD OVERWRITE friend ON TABLE user TYPE option<record<user>>;",
		]);
	});

	test("objects are defined field by field, through options and arrays", () => {
		const post = table("post", {
			meta: t.object({ a: t.string(), deep: t.object({ n: t.number() }) }),
			maybe: t.option(t.object({ x: t.string() })),
			items: t.array(t.object({ k: t.string() })),
			grid: t.array(t.array(t.object({ v: t.number() }))),
		});
		expect(sql(post).slice(1)).toEqual([
			"DEFINE FIELD OVERWRITE meta ON TABLE post TYPE object;",
			"DEFINE FIELD OVERWRITE meta.a ON TABLE post TYPE string;",
			"DEFINE FIELD OVERWRITE meta.deep ON TABLE post TYPE object;",
			"DEFINE FIELD OVERWRITE meta.deep.n ON TABLE post TYPE number;",
			"DEFINE FIELD OVERWRITE maybe ON TABLE post TYPE option<object>;",
			"DEFINE FIELD OVERWRITE maybe.x ON TABLE post TYPE string;",
			"DEFINE FIELD OVERWRITE items ON TABLE post TYPE array<object>;",
			"DEFINE FIELD OVERWRITE items[*].k ON TABLE post TYPE string;",
			"DEFINE FIELD OVERWRITE grid ON TABLE post TYPE array<array<object>>;",
			// One wildcard for each array the object is inside
			"DEFINE FIELD OVERWRITE grid[*][*].v ON TABLE post TYPE number;",
		]);
	});

	test("objects in a union or a tuple are literal object types", () => {
		const shape = table("shape", {
			v: t.union([
				t.object({ k: t.literal("a"), n: t.number() }),
				t.object({ k: t.literal("b") }),
			]),
			pair: t.array([t.string(), t.object({ n: t.number() })]),
		});
		expect(sql(shape).slice(1)).toEqual([
			"DEFINE FIELD OVERWRITE v ON TABLE shape TYPE { k: 'a', n: number } | { k: 'b' };",
			// A tuple keeps its length and the type at each position
			"DEFINE FIELD OVERWRITE pair ON TABLE shape TYPE [string, { n: number }];",
		]);
	});

	test("literals, unions, records of several tables and geometry", () => {
		const x = table("x", {
			level: t.union([t.literal("low"), t.literal("high")]),
			n: t.union([t.literal(1), t.literal(2)]),
			owner: t.record(["user", "team"]),
			any: t.record(),
			at: t.point(),
			span: t.duration(),
		});
		expect(sql(x).slice(1)).toEqual([
			"DEFINE FIELD OVERWRITE level ON TABLE x TYPE 'low' | 'high';",
			"DEFINE FIELD OVERWRITE n ON TABLE x TYPE 1 | 2;",
			"DEFINE FIELD OVERWRITE owner ON TABLE x TYPE record<user | team>;",
			"DEFINE FIELD OVERWRITE any ON TABLE x TYPE record;",
			"DEFINE FIELD OVERWRITE at ON TABLE x TYPE geometry<point>;",
			"DEFINE FIELD OVERWRITE span ON TABLE x TYPE duration;",
		]);
	});

	test("a string holding a quote is escaped, not left to break the statement", () => {
		const x = table("x", {
			a: t.literal("it's"),
			b: t.literal('say "hi"'),
			c: t.string().default("it's"),
		});
		expect(sql(x).slice(1)).toEqual([
			`DEFINE FIELD OVERWRITE a ON TABLE x TYPE "it's";`,
			`DEFINE FIELD OVERWRITE b ON TABLE x TYPE 'say "hi"';`,
			`DEFINE FIELD OVERWRITE c ON TABLE x TYPE string DEFAULT "it's";`,
		]);
	});

	test("static and expression defaults become DEFAULT; a function default is skipped with a reason", () => {
		const task = table("task", {
			status: t.string().default("open"),
			n: t.number().default(0),
			on: t.bool().default(true),
			created: t.date().default(expr("time::now()")),
			stamp: t.date().default(() => new Date()),
		});
		const { statements, skipped } = generateSchema(orm(new Surreal(), task));
		expect(statements.map((s) => s.sql).slice(1)).toEqual([
			"DEFINE FIELD OVERWRITE status ON TABLE task TYPE string DEFAULT 'open';",
			"DEFINE FIELD OVERWRITE n ON TABLE task TYPE number DEFAULT 0;",
			"DEFINE FIELD OVERWRITE on ON TABLE task TYPE bool DEFAULT true;",
			"DEFINE FIELD OVERWRITE created ON TABLE task TYPE datetime DEFAULT time::now();",
			"DEFINE FIELD OVERWRITE stamp ON TABLE task TYPE datetime;",
		]);
		expect(skipped).toEqual([
			{ path: "task.stamp", reason: expect.stringContaining("function") },
		]);
	});

	test("an edge is a relation between its tables", () => {
		const user = table("user", { name: t.string() });
		const team = table("team", { name: t.string() });
		const member = edge("user", "member", "team", { role: t.string() });
		const either = edge(["user", "team"] as never, "follows", "user", {});
		const out = sql(user, team, member, either as never);
		expect(out).toContain(
			"DEFINE TABLE OVERWRITE member TYPE RELATION IN user OUT team SCHEMAFULL;",
		);
		expect(out).toContain(
			"DEFINE FIELD OVERWRITE role ON TABLE member TYPE string;",
		);
		expect(out).toContain(
			"DEFINE TABLE OVERWRITE follows TYPE RELATION IN user | team OUT user SCHEMAFULL;",
		);
	});

	test("computed fields keep their own statement, once", () => {
		const user = table("user", { name: t.string() }).computed(
			"shout",
			t.string(),
			(row) => row.name.uppercase(),
		);
		const out = sql(user);
		expect(out).toHaveLength(3);
		expect(out[1]).toBe(
			"DEFINE FIELD OVERWRITE name ON TABLE user TYPE string;",
		);
		expect(out[2]).toMatch(
			/^DEFINE FIELD OVERWRITE shout ON TABLE user COMPUTED/,
		);
	});

	test("a computed field is kept by indexes and modifiers added before it", () => {
		const user = table("user", { name: t.string() })
			.schemaless()
			.index("name_idx", { fields: ["name"] })
			.computed("shout", t.string(), (row) => row.name.uppercase());
		const out = sql(user);
		expect(out[0]).toContain("SCHEMALESS");
		expect(
			out.some((s) => s.startsWith("DEFINE INDEX OVERWRITE name_idx")),
		).toBe(true);
	});

	test("tables are schemaless only when they say so, and if-not-exists leaves definitions", () => {
		const user = table("user", { name: t.string() }).schemaless();
		const db = orm(new Surreal(), user);
		const out = generateSchema(db, { mode: "if-not-exists" });
		expect(out.statements.map((s) => s.sql)).toEqual([
			"DEFINE TABLE IF NOT EXISTS user TYPE NORMAL SCHEMALESS;",
			"DEFINE FIELD IF NOT EXISTS name ON TABLE user TYPE string;",
		]);
	});

	test("statements are named, so two generations can be compared", () => {
		const user = table("user", {
			name: t.object({ first: t.string() }),
			tags: t.array(t.object({ k: t.string() })),
		}).index("name_idx", { fields: ["name.first"] });
		const names = generateSchema(orm(new Surreal(), user)).statements.map(
			(s) => `${s.kind}:${s.name}`,
		);
		expect(names).toEqual([
			"table:user",
			"field:user.name",
			"field:user.name.first",
			"field:user.tags",
			"field:user.tags[*].k",
			"index:user.name_idx",
		]);
	});

	test("toSurql is a file of statements, one per line", () => {
		const user = table("user", { name: t.string() });
		expect(toSurql(generateSchema(orm(new Surreal(), user)))).toBe(
			"DEFINE TABLE OVERWRITE user TYPE NORMAL SCHEMAFULL;\nDEFINE FIELD OVERWRITE name ON TABLE user TYPE string;\n",
		);
	});

	test("names that are not plain identifiers are escaped", () => {
		const odd = table("order-item", {
			"unit price": t.number(),
			dims: t.object({ "max width": t.number() }),
		});
		const out = sql(odd);
		expect(out[0]).toContain("⟨order-item⟩");
		expect(out[1]).toBe(
			"DEFINE FIELD OVERWRITE ⟨unit price⟩ ON TABLE ⟨order-item⟩ TYPE number;",
		);
		expect(out[3]).toBe(
			"DEFINE FIELD OVERWRITE dims.⟨max width⟩ ON TABLE ⟨order-item⟩ TYPE number;",
		);
		const link = table("link", { to: t.record("order-item") });
		expect(sql(link)[1]).toContain("record<⟨order-item⟩>");
	});
});
