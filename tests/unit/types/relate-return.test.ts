import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import { __display, displayContext, edge, orm, t, table } from "../../../src";

/**
 * `relate().return(cb)` must type its result as precisely as `create().return(cb)`
 * does. `tsc` (run by `bun run type-check`) fails on a mismatch.
 */

type Equal<A, B> =
	(<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2
		? true
		: false;
const assertType = <T extends true>() => undefined as unknown as T;

/** The row type a query resolves to, for a query that is not `.only()`. */
type RowOf<Q> = Q extends { execute(): Promise<(infer R)[]> } ? R : never;

const person = table("person", { name: t.string(), age: t.number() });
const follows = edge("person", "follows", "person", {
	weight: t.number(),
	label: t.string(),
});
const db = orm(new Surreal(), person, follows);
const from = new RecordId("person", "a");
const to = new RecordId("person", "b");

const dated = edge("person", "knows", "person", {
	weight: t.number().default(1),
	since: t.option(t.number()),
});
const withDefaults = orm(new Surreal(), person, dated);

describe("relate() result types with defaults", () => {
	test("a defaulted edge field is typed as present after set() (RELATE applies it)", () => {
		const rel = withDefaults.relate("knows", from, to).set({ since: 2020 });
		assertType<Equal<RowOf<typeof rel>["weight"], number>>();
	});

	test("a defaulted edge field is typed as present with no data (RELATE applies it)", () => {
		const rel = withDefaults.relate("knows", from, to);
		assertType<Equal<RowOf<typeof rel>["weight"], number>>();
	});
});

describe("relate().return(cb) result types", () => {
	test("a callback's projection is typed exactly, like create().return(cb)", () => {
		const rel = db
			.relate("follows", from, to)
			.set({ weight: 1, label: "x" })
			.return((e) => ({ w: e.weight, who: e.label }));
		assertType<Equal<RowOf<typeof rel>, { w: number; who: string }>>();

		const created = db
			.create("person")
			.set({ name: "a", age: 1 })
			.return((p) => ({ n: p.name }));
		assertType<Equal<RowOf<typeof created>, { n: string }>>();
	});

	test("a single-field projection is typed as that field", () => {
		const rel = db
			.relate("follows", from, to)
			.set({ weight: 1, label: "x" })
			.return((e) => e.weight);
		assertType<Equal<RowOf<typeof rel>, number>>();
	});

	test("the projection renders as RETURN VALUE", () => {
		const rel = db
			.relate("follows", from, to)
			.set({ weight: 1, label: "x" })
			.return((e) => ({ w: e.weight }));
		const sql = (
			rel as unknown as {
				[__display]: (c: ReturnType<typeof displayContext>) => string;
			}
		)[__display](displayContext());
		expect(sql).toContain("RETURN VALUE");
	});
});

/** What a query resolves to, whether or not it is `.only()`. */
type ResultOf<Q> = Q extends { execute(): Promise<infer R> } ? R : never;
/** The element type of a resolved array. */
type Elem<R> = R extends (infer E)[] ? E : never;

describe("relate().return(mode) result types", () => {
	const render = (query: unknown) =>
		(
			query as { [__display]: (c: ReturnType<typeof displayContext>) => string }
		)[__display](displayContext());

	const base = db.relate("follows", from, to).set({ weight: 1, label: "x" });

	const after = base.return("after");
	const before = base.return("before");
	const none = base.return("none");
	const onlyAfter = base.only().return("after");
	const onlyBefore = base.only().return("before");
	const onlyNone = base.only().return("none");

	// RETURN AFTER is the edge row.
	type Row = Elem<ResultOf<typeof after>>;

	test("RETURN AFTER resolves to the edge rows", () => {
		assertType<Equal<ResultOf<typeof after>, Row[]>>();
		assertType<Equal<Row["weight"], number>>();
		assertType<Equal<ResultOf<typeof onlyAfter>, Row>>();
	});

	// A new edge has no before-state, so RETURN BEFORE gives NONE for each edge.
	test("RETURN BEFORE resolves to one possibly-absent row per edge", () => {
		assertType<Equal<ResultOf<typeof before>, (Row | undefined)[]>>();
		assertType<Equal<ResultOf<typeof onlyBefore>, Row | undefined>>();
	});

	// RETURN NONE gives no rows at all.
	test("RETURN NONE resolves to no rows", () => {
		assertType<Equal<ResultOf<typeof none>, never[]>>();
		assertType<Equal<ResultOf<typeof onlyNone>, undefined>>();
	});

	test("a union of modes is typed as the union of their results", () => {
		const mode = Math.random() > 0.5 ? "none" : "after";
		const q = base.return(mode);
		assertType<Equal<ResultOf<typeof q>, never[] | Row[]>>();
	});

	test("RETURN BEFORE and RETURN NONE still render as their clauses", () => {
		expect(render(before)).toContain(" RETURN BEFORE");
		expect(render(none)).toContain(" RETURN NONE");
	});
});
