import { describe, expect, test } from "bun:test";
import { BoundQuery, Surreal, Table } from "surrealdb";
import { orm, t, table } from "../../../src";

// Compile-time equality assertion helper.
type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;

const user = table("user", { name: t.string(), email: t.string() });
const db = orm(new Surreal(), user);

describe("Query.prepare()", () => {
	test("compiles into a BoundQuery with the query string and bindings", () => {
		const prepared = db
			.select("user")
			.return((u) => ({ fullName: u.name, email: u.email }))
			.prepare();

		expect(prepared).toBeInstanceOf(BoundQuery);
		expect(prepared.query).toContain("SELECT VALUE");
		expect(prepared.query).toContain("fullName");
		// The table is passed as a binding, not inlined.
		expect(Object.values(prepared.bindings)).toContainEqual(new Table("user"));
	});

	test("preserves the inferred result type for surreal.query()", () => {
		const prepared = db
			.select("user")
			.return((u) => ({ fullName: u.name, email: u.email }))
			.prepare();

		// The SDK types `surreal.query(BoundQuery<R>)` as `R`, so the prepared
		// query must carry `[ResultType]` (one entry per statement).
		type R = typeof prepared extends BoundQuery<infer X> ? X : never;
		const _check: Equal<R, [{ fullName: string; email: string }[]]> = true;
		expect(_check).toBe(true);
	});

	test("a bare table select prepares as the full-row schema", () => {
		const prepared = db.select("user").prepare();
		type R = typeof prepared extends BoundQuery<infer X> ? X : never;
		const _check: Equal<
			R,
			[
				{
					id: import("surrealdb").RecordId<"user">;
					name: string;
					email: string;
				}[],
			]
		> = true;
		expect(_check).toBe(true);
		expect(prepared.query).toContain("SELECT");
	});
});
