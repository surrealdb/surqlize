import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { edge, orm, t, table } from "../../../src";
import type { AbstractType } from "../../../src/types/classes";
import { RecordType, UuidType } from "../../../src/types/classes";

describe("Table modifiers", () => {
	test("record their metadata", () => {
		const user = table("user", { name: t.string() })
			.schemaless()
			.permissions({ select: "FULL", create: "WHERE $auth.id = id" })
			.changefeed("3d", true)
			.comment("People");

		expect(user.ddl.schemafull).toBe(false);
		expect(user.ddl.permissions).toEqual({
			select: "FULL",
			create: "WHERE $auth.id = id",
		});
		expect(user.ddl.changefeed).toEqual({
			duration: "3d",
			includeOriginal: true,
		});
		expect(user.ddl.comment).toBe("People");
	});

	test("schemafull and schemaless are opposites", () => {
		expect(table("a", {}).schemafull().ddl.schemafull).toBe(true);
		expect(table("a", {}).schemaless().ddl.schemafull).toBe(false);
		// Unset means "use the default", which is schemafull
		expect(table("a", {}).ddl.schemafull).toBeUndefined();
	});

	test("accept a single permissions rule as well as per-operation rules", () => {
		expect(table("a", {}).permissions("NONE").ddl.permissions).toBe("NONE");
	});

	test("are immutable — a modifier never mutates its receiver", () => {
		const base = table("user", { name: t.string() });
		const derived = base.schemaless();

		expect(base.ddl.schemafull).toBeUndefined();
		expect(derived.ddl.schemafull).toBe(false);
		expect(derived).not.toBe(base);
	});

	test("preserve fields and the inferred type through a chain", () => {
		const user = table("user", { name: t.string() }).schemaless().drop();

		expect(Object.keys(user.fields).sort()).toEqual(["id", "name"]);
		expect(user.validate({ id: new RecordId("user", 1), name: "a" })).toBe(
			true,
		);
	});

	test("still drive the query builder after modification", () => {
		const user = table("user", { age: t.int() }).schemaless();
		const db = orm(null as never, user);
		expect(db.select("user").where((u) => u.age.gte(18))).toBeDefined();
	});
});

describe("The id field", () => {
	test("is injected as a record link by default", () => {
		const user = table("user", { name: t.string() });
		expect(user.fields.id).toBeInstanceOf(RecordType);
	});

	test("can be overridden by declaring one", () => {
		// Useful when the table generates its own ids.
		const doc = table("doc", {
			id: t.uuid().default("rand::uuid::v7()").readonly(),
			title: t.string(),
		});

		expect(doc.fields.id).toBeInstanceOf(UuidType);
		expect(doc.fields.id.ddl.default).toEqual({
			value: "rand::uuid::v7()",
			always: false,
		});
	});

	test("a declared id is validated as declared", () => {
		const doc = table("doc", { id: t.string() });
		expect(doc.validate({ id: "abc" })).toBe(true);
		expect(doc.validate({ id: new RecordId("doc", 1) })).toBe(false);
	});
});

describe("Edge modifiers", () => {
	test("record their metadata, including enforced", () => {
		const authored = edge("user", "authored", "post", { at: t.date() })
			.enforced()
			.comment("Authorship");

		expect(authored.ddl.enforced).toBe(true);
		expect(authored.ddl.comment).toBe("Authorship");
	});

	test("keep in and out authoritative even if declared", () => {
		// `in`/`out` define the edge; a schema cannot redefine them.
		const declared: Record<string, AbstractType> = { in: t.string() };
		const authored = edge("user", "authored", "post", declared);

		const inField = authored.fields.in as RecordType<"user">;
		expect(inField).toBeInstanceOf(RecordType);
		expect(inField.tb).toBe("user");
	});

	test("are immutable", () => {
		const base = edge("user", "authored", "post", {});
		expect(base.enforced().ddl.enforced).toBe(true);
		expect(base.ddl.enforced).toBeUndefined();
	});
});
