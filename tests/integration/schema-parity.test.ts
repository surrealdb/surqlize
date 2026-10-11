import { describe, expect, test } from "bun:test";
import { Duration, GeometryPoint, RecordId, Uuid } from "surrealdb";
import { type AbstractType, generateSchema, orm, t, table } from "../../src";
import { withTestDb } from "./setup";

/**
 * Parity between what the types accept on the client and what the database
 * accepts once the generated `DEFINE` statements are applied. For each type,
 * values are sent to both, and any disagreement is a bug in the mapping (or an
 * explicit, documented exception).
 */

/** Marks a field the value leaves out. */
const OMIT = Symbol("omit");

type Case = {
	name: string;
	type: AbstractType;
	ok: unknown[];
	bad: unknown[];
};

const user = (id: string) => new RecordId("user", id);
const team = (id: string) => new RecordId("team", id);

const cases: Case[] = [
	{
		name: "string",
		type: t.string(),
		ok: ["a", ""],
		bad: [1, null, true, OMIT],
	},
	{
		name: "number",
		type: t.number(),
		ok: [1, 1.5, -3, 0],
		bad: ["1", null, OMIT],
	},
	{ name: "bool", type: t.bool(), ok: [true, false], bad: [0, "true", OMIT] },
	{
		name: "date",
		type: t.date(),
		ok: [new Date()],
		bad: ["2026-01-01", 1, OMIT],
	},
	{
		name: "duration",
		type: t.duration(),
		ok: [new Duration("1h")],
		bad: ["1h", 5, OMIT],
	},
	{
		name: "uuid",
		type: t.uuid(),
		ok: [new Uuid("018f2c80-5b77-7a52-8f1a-4a3c8c1c5d11")],
		bad: ["x", 1, OMIT],
	},
	{
		name: "point",
		type: t.point(),
		ok: [new GeometryPoint([1, 2])],
		bad: [{ x: 1 }, [1, 2], OMIT],
	},
	{
		name: "literal string union",
		type: t.union([t.literal("a"), t.literal("b")]),
		ok: ["a", "b"],
		bad: ["c", 1, OMIT],
	},
	{
		name: "literal number union",
		type: t.union([t.literal(1), t.literal(2)]),
		ok: [1, 2],
		bad: [3, "1", OMIT],
	},
	{
		name: "literal bool",
		type: t.literal(true),
		ok: [true],
		bad: [false, OMIT],
	},
	{
		name: "string | number",
		type: t.union([t.string(), t.number()]),
		ok: ["a", 1],
		bad: [true, null, OMIT],
	},
	{
		name: "option<string>",
		type: t.option(t.string()),
		ok: ["a", OMIT],
		bad: [1, null],
	},
	{
		name: "option<number>",
		type: t.option(t.number()),
		ok: [1, OMIT],
		bad: ["x", null],
	},
	{
		name: "record<user>",
		type: t.record("user"),
		ok: [user("a")],
		bad: [team("a"), "user:a", OMIT],
	},
	{
		name: "record<user|team>",
		type: t.record(["user", "team"]),
		ok: [user("a"), team("a")],
		bad: [new RecordId("other", "a"), OMIT],
	},
	{
		name: "record",
		type: t.record(),
		ok: [user("a"), new RecordId("x", 1)],
		bad: ["user:a", 1, OMIT],
	},
	{
		name: "option<record<user>>",
		type: t.option(t.record("user")),
		ok: [user("a"), OMIT],
		bad: [team("a"), null],
	},
	{
		name: "array<string>",
		type: t.array(t.string()),
		ok: [[], ["a", "b"]],
		bad: [["a", 1], "a", OMIT],
	},
	{
		name: "array<record<user>>",
		type: t.array(t.record("user")),
		ok: [[user("a")]],
		bad: [[team("a")], OMIT],
	},
	{
		name: "tuple",
		type: t.array([t.number(), t.string()]),
		ok: [[1, "a"]],
		bad: [[1], ["a", 1], [1, "a", 2], OMIT],
	},
	{
		name: "object",
		type: t.object({ a: t.string(), b: t.option(t.number()) }),
		ok: [{ a: "x" }, { a: "x", b: 1 }, { a: "x", extra: true }],
		bad: [{}, { a: 1 }, { a: "x", b: "y" }, "x", OMIT],
	},
	{
		name: "option<object>",
		type: t.option(t.object({ a: t.string() })),
		ok: [{ a: "x" }, OMIT],
		bad: [{}, { a: 1 }, null],
	},
	{
		name: "nested object",
		type: t.object({ inner: t.object({ n: t.number() }) }),
		ok: [{ inner: { n: 1 } }],
		bad: [{ inner: {} }, { inner: { n: "x" } }, {}],
	},
	{
		name: "array<object>",
		type: t.array(t.object({ n: t.number() })),
		ok: [[], [{ n: 1 }, { n: 2 }]],
		bad: [[{ n: "x" }], [{}], [1]],
	},
	{
		name: "array<array<object>>",
		type: t.array(t.array(t.object({ n: t.number() }))),
		ok: [[[{ n: 1 }]]],
		bad: [[[{ n: "x" }]], [{ n: 1 }]],
	},
	{
		name: "option<array<object>>",
		type: t.option(t.array(t.object({ n: t.number() }))),
		ok: [[{ n: 1 }], OMIT],
		bad: [[{ n: "x" }]],
	},
	{
		name: "union of objects",
		type: t.union([
			t.object({ kind: t.literal("a"), n: t.number() }),
			t.object({ kind: t.literal("b"), s: t.string() }),
		]),
		ok: [
			{ kind: "a", n: 1 },
			{ kind: "b", s: "x" },
		],
		bad: [{ kind: "a", s: "x" }, { kind: "c" }, OMIT],
	},
	{ name: "int", type: t.int(), ok: [1, -3, 0], bad: [1.5, "1", OMIT] },
	{ name: "float", type: t.float(), ok: [1.5, 2], bad: ["1", OMIT] },
	{
		name: "bytes",
		type: t.bytes(),
		ok: [new Uint8Array([1, 2])],
		bad: ["ab", [1, 2], OMIT],
	},
	{ name: "any", type: t.any(), ok: [1, "a", null, { a: 1 }, OMIT], bad: [] },
	{
		name: "literal holding a quote",
		type: t.union([t.literal("it's"), t.literal('say "hi"')]),
		ok: ["it's", 'say "hi"'],
		bad: ["its", OMIT],
	},
	{
		name: "set<string>",
		type: t.set(t.string()),
		ok: [new Set(["a", "b"]), new Set()],
		// A plain array is left out: servers from 3.3 coerce one into a set and
		// earlier ones refuse it. That difference is checked, per version, in
		// set.test.ts. The client rejects an array on every server.
		bad: ["a", null, {}, new Set([1]), OMIT],
	},
	{
		name: "tuple with an object",
		type: t.array([t.string(), t.object({ n: t.number() })]),
		ok: [["a", { n: 1 }]],
		bad: [["a", { n: "x" }], ["a"]],
	},
];

/** What went wrong for one value, for a failure message. */
const explain = (
	value: unknown,
	verdict: boolean,
	client: boolean,
	server: boolean,
) =>
	`${show(value)}: expected ${verdict ? "accept" : "reject"}, client ${client ? "accepts" : "rejects"}, server ${server ? "accepts" : "rejects"}`;

/** A value as text, for a failure message. */
const show = (value: unknown): string =>
	value === OMIT
		? "(omitted)"
		: JSON.stringify(value, (_, v) =>
				typeof v === "bigint"
					? String(v)
					: v instanceof Set
						? { Set: [...v] }
						: v,
			);

describe("generated schema parity (integration)", () => {
	const getTestDb = withTestDb({ perTest: true });

	/** Whether the database accepts a record holding `data`. */
	async function serverAccepts(id: string, data: unknown): Promise<boolean> {
		const { surreal } = getTestDb();
		try {
			await surreal.query("CREATE type::record('parity', $id) CONTENT $data", {
				id,
				data,
			});
			return true;
		} catch {
			return false;
		}
	}

	for (const c of cases) {
		test(`${c.name}: the database and the client agree`, async () => {
			const { surreal } = getTestDb();
			// Schemaless, because the client accepts keys the schema does not declare.
			const schema = table("parity", { f: c.type }).schemaless();
			const { statements, skipped } = generateSchema(orm(surreal, schema));
			expect(skipped).toEqual([]);
			await surreal.query(statements.map((s) => `${s.sql};`).join("\n"));

			const checks = [
				...c.ok.map((value) => [true, value] as const),
				...c.bad.map((value) => [false, value] as const),
			];
			const disagreements: string[] = [];
			for (const [i, [verdict, value]] of checks.entries()) {
				const data = value === OMIT ? {} : { f: value };
				const client = schema.safeParse(data).success;
				const server = await serverAccepts(`r${i}`, data);
				if (client !== verdict || server !== verdict) {
					disagreements.push(explain(value, verdict, client, server));
				}
			}
			expect(disagreements).toEqual([]);
		});
	}
});
