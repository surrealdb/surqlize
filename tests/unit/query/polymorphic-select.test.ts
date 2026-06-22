import { describe, expect, test } from "bun:test";
import { RecordId, Surreal, Table } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";
import { resolveSubjectSchema } from "../../../src/query/subject.ts";

// Compile-time equality assertion helper.
type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;

const render = (q: {
	[__display]: (ctx: ReturnType<typeof displayContext>) => string;
}) => q[__display](displayContext());

const user = table("user", {
	name: t.string(),
	age: t.number(),
	born: t.date(),
});
const company = table("company", { name: t.string(), founded: t.date() });
const file = table("file", {
	name: t.string(),
	owner: t.record(["user", "company"]),
});
const db = orm(new Surreal(), user, company, file);

describe("polymorphic / multi-table SELECT", () => {
	test("polymorphic record-link .select() no longer crashes (regression)", () => {
		const q = db.select("file").return((f) => ({
			name: f.name,
			owner: f.owner.select().return((o) => ({ name: o.name })),
		}));

		// Previously threw `TypeError: undefined is not an object` because the
		// builder dereferenced `orm.tables[["user","company"]]`.
		const sql = render(q);
		expect(sql).toContain("FROM $parent.owner");

		type R = t.infer<typeof q>;
		const _check: Equal<R, { name: string; owner: { name: string }[] }[]> =
			true;
		expect(_check).toBe(true);
	});

	test("top-level multi-table select renders FROM user, company", () => {
		const q = db.select(["user", "company"]).return((o) => ({ name: o.name }));
		const ctx = displayContext();
		const sql = q[__display](ctx);

		expect(sql).toMatch(/FROM \$\w+, \$\w+/);
		expect(Object.values(ctx.variables)).toContainEqual(new Table("user"));
		expect(Object.values(ctx.variables)).toContainEqual(new Table("company"));
	});

	test("partial fields are optional; common fields stay required", () => {
		const q = db.select(["user", "company"]).return((o) => ({
			name: o.name, // present in both → string
			age: o.age, //   user only      → number | undefined
			born: o.born, // user only      → Date | undefined
		}));

		type R = t.infer<typeof q>;
		const _check: Equal<
			R,
			{ name: string; age: number | undefined; born: Date | undefined }[]
		> = true;
		expect(_check).toBe(true);
	});

	test("a field whose type differs across tables becomes a field-level union", () => {
		const q = db.select(["user", "company"]).return((o) => ({
			name: o.name,
			ref: o.id, // RecordId<"user"> on user, RecordId<"company"> on company
		}));

		type R = t.infer<typeof q>;
		const _check: Equal<
			R,
			{ name: string; ref: RecordId<"user"> | RecordId<"company"> }[]
		> = true;
		expect(_check).toBe(true);
	});

	test("a member-specific field is reachable as an optional", () => {
		// Unlike a plain union (which exposes only common fields), the merged row
		// exposes every member's fields; ones missing from some member are optional.
		const q = db.select(["user", "company"]).return((o) => ({
			founded: o.founded, // company only → Date | undefined
		}));
		type R = t.infer<typeof q>;
		const _check: Equal<R, { founded: Date | undefined }[]> = true;
		expect(_check).toBe(true);
	});

	test("single-table select is unchanged — no spurious | undefined", () => {
		const q = db.select("user").return((o) => ({ name: o.name, age: o.age }));
		type R = t.infer<typeof q>;
		const _check: Equal<R, { name: string; age: number }[]> = true;
		expect(_check).toBe(true);
	});
});

describe("resolveSubjectSchema — runtime schema merge", () => {
	test("merges member schemas: common, partial, and divergent fields", () => {
		const merged = resolveSubjectSchema(db, ["user", "company"]);
		const fields = merged.schema;

		// present in both with the same type → kept as-is
		expect(fields.name!.name).toBe("string");
		// present in only one member → wrapped in option<…>
		expect(fields.age!.name).toBe("option");
		expect(fields.born!.name).toBe("option");
		expect(fields.founded!.name).toBe("option");
		// present in both but divergent (id: user vs company) → union
		expect(fields.id!.name).toBe("union");
	});

	test("a single table resolves to its own schema", () => {
		const merged = resolveSubjectSchema(db, "user");
		expect(merged).toEqual(db.tables.user.schema);
	});

	test("parses a company row's missing fields to undefined (SurrealDB NONE)", () => {
		const merged = resolveSubjectSchema(db, ["user", "company"]);
		const parsed = merged.parse({
			id: new RecordId("company", "acme"),
			name: "Acme",
			founded: new Date("2000-01-01"),
		});

		// `age` and `born` are user-only, so they are absent on a company row and
		// resolve to `undefined` rather than throwing.
		expect(parsed.name).toBe("Acme");
		expect(parsed.age).toBeUndefined();
		expect(parsed.born).toBeUndefined();
		expect(parsed.founded).toBeInstanceOf(Date);
	});
});
