import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import {
	__display,
	__type,
	displayContext,
	type Orm,
	orm,
	t,
	table,
} from "../../../src";

// Compile-time equality assertion helper.
type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;
const assertType = <_T extends true>() => {};

const post = table("post", { title: t.string(), author: t.record("user") });

const user = table("user", { first: t.string(), last: t.string() })
	.computed("fullName", t.string(), (row) => row.first.concat(" ", row.last))
	.computed("postCount", t.number(), (row, db: Orm<[typeof post]>) =>
		db
			.select("post")
			.where((p) => p.author.eq(row.id))
			.return((p) => p.id)
			.wrap()
			.len(),
	);

const db = orm(new Surreal(), user, post);

describe("TableSchema.computed()", () => {
	test("adds the field to the row schema, typed as declared", () => {
		expect(user.fields.fullName.name).toBe("string");
		expect(user.fields.postCount.name).toBe("number");
		expect(user.computedFields).toEqual(["fullName", "postCount"]);
		expect(user.fields.first.name).toBe("string");
	});

	test("does not mutate the table it was called on", () => {
		const base = table("thing", { a: t.string() });
		const derived = base.computed("b", t.string(), (row) => row.a);
		expect(base.computedFields).toEqual([]);
		expect(derived.computedFields).toEqual(["b"]);
		expect("b" in base._fields).toBe(false);
	});

	test("rejects a name that is already in use", () => {
		const base = table("thing", { a: t.string() });
		expect(() =>
			// @ts-expect-error `a` already exists on the table.
			base.computed("a", t.string(), (row) => row.a),
		).toThrow('Field "a" is already defined on table "thing"');
		expect(() =>
			// @ts-expect-error `id` is reserved.
			base.computed("id", t.string(), (row) => row.a),
		).toThrow("already defined");
		expect(() =>
			base
				.computed("b", t.string(), (row) => row.a)
				// @ts-expect-error `b` is already computed.
				.computed("b", t.string(), (row) => row.a),
		).toThrow("already defined");
	});

	test("the expression is rendered against $this", () => {
		const [fullName] = user.computedStatements(db);
		expect(fullName).toBe(
			'DEFINE FIELD OVERWRITE fullName ON TABLE user COMPUTED (string::concat($this.first, " ", $this.last))',
		);
	});

	test("subqueries refer to the computed row as $parent, with values inlined", () => {
		const [, postCount] = user.computedStatements(db);
		expect(postCount).toBe(
			"DEFINE FIELD OVERWRITE postCount ON TABLE user COMPUTED (array::len(((SELECT VALUE $this.id FROM post WHERE $this.author = $parent.id))))",
		);
		expect(postCount).toContain("$parent.id");
		expect(postCount).not.toMatch(/\$_v\d/);
	});

	test("a table without computed fields has no statements", () => {
		expect(post.computedStatements(db)).toEqual([]);
	});

	test("validates a row that carries its computed values", () => {
		const parsed = user.schema.parse({
			id: new RecordId("user", "a"),
			first: "A",
			last: "B",
			fullName: "A B",
			postCount: 1,
		});
		expect(parsed.fullName).toBe("A B");
		expect(() =>
			user.schema.parse({
				id: new RecordId("user", "a"),
				first: "A",
				last: "B",
			}),
		).toThrow();
	});
});

describe("computed fields are read-only", () => {
	test("are present in the select type", () => {
		const q = db.select("user");
		type Row = (typeof q)["type"][number];
		assertType<Equal<Row["fullName"], string>>();
		assertType<Equal<Row["postCount"], number>>();
		assertType<Equal<Row["first"], string>>();
	});

	test("cannot be written", () => {
		db.create("user").set({ first: "A", last: "B" });
		// @ts-expect-error computed fields are not part of the input.
		db.create("user").set({ fullName: "x" });
		// @ts-expect-error computed fields are not part of the input.
		db.update("user", "a").set({ postCount: 1 });
		// @ts-expect-error computed fields are not part of the input.
		db.update("user", "a").merge({ fullName: "x" });
		// @ts-expect-error computed fields are not part of the input.
		db.upsert("user", "a").content({ fullName: "x" });
		db.create("user").content({ first: "A", last: "B" });
		db.update("user", "a").merge({ first: "A" });
		// @ts-expect-error computed fields are not part of the input.
		db.insert("user").onDuplicate({ fullName: "x" });
	});

	test("can be referenced in expressions", () => {
		const q = db.select("user").where((u) => u.postCount.gt(1));
		const ctx = displayContext();
		expect(q[__display](ctx)).toContain("$this.postCount >");
		expect(q[__type].schema.schema.fullName.name).toBe("string");
	});
});
