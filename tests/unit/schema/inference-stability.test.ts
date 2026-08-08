import { describe, expect, test } from "bun:test";
import type { RecordId, Uuid } from "surrealdb";
import { edge, t, table } from "../../../src";

/**
 * Schema modifiers must be inert to type inference.
 *
 * `tests/smoke/type-check.mts` pins the same property against the *packaged*
 * declarations, but only after a build. These run on every `bun test`, so
 * inference drift is caught immediately rather than at pack time.
 */

/** Invariant type equality — catches drift in either direction, not just assignability. */
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
type Expect<T extends true> = T;

describe("Inference is unaffected by DDL metadata", () => {
	test("a table with modifiers infers the same row as one without", () => {
		const plain = table("user", {
			name: t.string(),
			age: t.number(),
		});

		const decorated = table("user", {
			name: t.string().assert("string::len($value) > 2").comment("Name"),
			age: t.number().default(0).readonly(),
		})
			.schemaless()
			.permissions("FULL")
			.comment("People");

		type Plain = (typeof plain)["type"];
		type Decorated = (typeof decorated)["type"];

		type _AssertSame = Expect<Equal<Plain, Decorated>>;
		type _AssertShape = Expect<
			Equal<Plain, { id: RecordId<"user">; name: string; age: number }>
		>;

		// The assertions above are the test; `void` keeps them referenced under
		// noUnusedLocals, matching tests/smoke/type-check.mts.
		void (null as _AssertSame | _AssertShape | null);
		expect(plain.tb).toBe(decorated.tb);
	});

	test("an overridden id changes the row type to match", () => {
		const doc = table("doc", {
			id: t.uuid().default("rand::uuid::v7()"),
			title: t.string(),
		});

		type Row = (typeof doc)["type"];
		type _AssertId = Expect<Equal<Row, { id: Uuid; title: string }>>;

		void (null as _AssertId | null);
		expect(doc.fields.id).toBeDefined();
	});

	test("an edge with modifiers infers the same row as one without", () => {
		const plain = edge("user", "authored", "post", { at: t.date() });
		const decorated = edge("user", "authored", "post", {
			at: t.date().defaultAlways("time::now()"),
		}).enforced();

		type Plain = (typeof plain)["type"];
		type Decorated = (typeof decorated)["type"];

		type _AssertSame = Expect<Equal<Plain, Decorated>>;
		type _AssertShape = Expect<
			Equal<
				Plain,
				{
					id: RecordId<"authored">;
					at: Date;
					in: RecordId<"user">;
					out: RecordId<"post">;
				}
			>
		>;

		void (null as _AssertSame | _AssertShape | null);
		expect(plain.tb).toBe(decorated.tb);
	});

	test("field modifiers preserve the field's own inferred type", () => {
		const decorated = t.string().assert("x").readonly().comment("y");
		type Field = (typeof decorated)["infer"];
		type _Assert = Expect<Equal<Field, string>>;

		void (null as _Assert | null);
		expect(decorated.validate("a")).toBe(true);
	});
});
