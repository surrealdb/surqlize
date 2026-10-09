import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { edge, orm, t, table } from "../../../src";
import { createVariableStore } from "../../../src/utils";
import { actionable } from "../../../src/utils/actionable";
import { __ctx, __display, __type } from "../../../src/utils/workable";

describe("derived-data caches", () => {
	test("table schema and fields are built once", () => {
		const user = table("user", { name: t.string() });
		expect(user.schema).toBe(user.schema);
		expect(user.fields).toBe(user.fields);
		expect(Object.keys(user.fields)).toEqual(["name", "id"]);
	});

	test("a computed table does not share the cache of its parent", () => {
		const user = table("user", { name: t.string() });
		void user.schema;
		const withComputed = user.computed("n", t.number(), () => {
			throw new Error("not evaluated");
		});
		expect(Object.keys(withComputed.fields)).toContain("n");
		expect(Object.keys(user.fields)).not.toContain("n");
	});

	test("edge schema and fields are built once", () => {
		const authored = edge("user", "authored", "post", { role: t.string() });
		expect(authored.schema).toBe(authored.schema);
		expect(authored.fields).toBe(authored.fields);
		expect(Object.keys(authored.fields)).toEqual(["role", "id", "in", "out"]);
	});
});

describe("variable store", () => {
	test("numbers variables in registration order", () => {
		const [variables, v] = createVariableStore();
		expect(v("a")).toBe("$_v0");
		expect(v("b")).toBe("$_v1");
		expect(v("c")).toBe("$_v2");
		expect(variables).toEqual({ _v0: "a", _v1: "b", _v2: "c" });
	});

	test("never overwrites an entry added by the caller", () => {
		const [variables, v] = createVariableStore();
		variables._v0 = "mine";
		expect(v("a")).toBe("$_v1");
		expect(variables._v0).toBe("mine");
	});
});

describe("actionable", () => {
	// A field named like a function (`eq` exists on every type).
	const thing = table("thing", { eq: t.string(), age: t.number() });
	const db = orm(new Surreal(), thing);
	const row = actionable({
		[__ctx]: { orm: db, id: Symbol() },
		[__type]: db.tables.thing.schema,
		[__display]: () => "$this",
	} as never) as unknown as {
		eq: { (v: unknown): unknown; valueOf(): { gt: unknown } };
		age: { gt: unknown };
	};

	test("a property named like a function stays callable and resolves as a field via valueOf", () => {
		expect(typeof row.eq).toBe("function");
		const field = row.eq.valueOf() as unknown as { len: unknown };
		expect(typeof field.len).toBe("function");
	});

	test("reading a function twice returns the same bound function", () => {
		expect(row.eq).toBe(row.eq);
	});

	test("plain fields resolve to actionables", () => {
		expect(typeof row.age.gt).toBe("function");
	});
});
