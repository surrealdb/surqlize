import { describe, expect, test } from "bun:test";
import { type RecordId, Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

/**
 * `delete().return("after")` types its result as one NONE per deleted record,
 * because the record is gone by the time RETURN AFTER reads it. `tsc` (run by
 * `bun run type-check`) fails on a mismatch.
 */

type Equal<A, B> =
	(<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2
		? true
		: false;
const assertType = <T extends true>() => undefined as unknown as T;

/** What a query resolves to, whether or not it is `.only()`. */
type ResultOf<Q> = Q extends { execute(): Promise<infer R> } ? R : never;
/** The element type of a resolved array. */
type Elem<R> = R extends (infer E)[] ? E : never;

const user = table("user", { name: t.string(), age: t.number() });
const db = orm(new Surreal(), user);

describe("delete().return(mode) result types", () => {
	const render = (query: unknown) =>
		(
			query as { [__display]: (c: ReturnType<typeof displayContext>) => string }
		)[__display](displayContext());

	const base = db.delete("user");
	const after = base.return("after");
	const onlyAfter = db.delete("user", "alice").only().return("after");
	const before = base.return("before");
	const none = base.return("none");

	// The deleted record is gone when RETURN AFTER reads it: NONE for each record.
	test("RETURN AFTER resolves to one undefined per deleted record", () => {
		assertType<Equal<ResultOf<typeof after>, undefined[]>>();
		assertType<Equal<ResultOf<typeof onlyAfter>, undefined>>();
	});

	test("RETURN BEFORE still resolves to the deleted rows", () => {
		type Row = Elem<ResultOf<typeof before>>;
		assertType<Equal<ResultOf<typeof before>, Row[]>>();
		assertType<Equal<Row["id"], RecordId<"user">>>();
	});

	test("RETURN NONE resolves to no rows", () => {
		assertType<Equal<ResultOf<typeof none>, never[]>>();
	});

	// A mode chosen at run time is typed as the union of the modes' results: a
	// mode that includes AFTER gives undefined, not rows.
	test("a runtime-chosen mode with after is typed as undefined, not rows", () => {
		const mode = Math.random() > 0.5 ? "none" : "after";
		const q = base.return(mode);
		assertType<Equal<ResultOf<typeof q>, never[] | undefined[]>>();
	});

	test("a runtime-chosen mode with before and after is typed as rows or undefined", () => {
		type Row = Elem<ResultOf<typeof before>>;
		const mode = Math.random() > 0.5 ? "before" : "after";
		const q = base.return(mode);
		assertType<Equal<ResultOf<typeof q>, Row[] | undefined[]>>();
	});

	test("RETURN AFTER still renders as its clause", () => {
		expect(render(after)).toContain(" RETURN AFTER");
		expect(render(before)).toContain(" RETURN BEFORE");
	});
});
