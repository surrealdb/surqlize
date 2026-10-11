import { describe, expect, test } from "bun:test";
import { type RecordId, Surreal } from "surrealdb";
import {
	__display,
	displayContext,
	expr,
	type HasDefault,
	orm,
	t,
	table,
} from "../../../src";

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
const assertType = <_T extends true>() => {};

const user = table("user", {
	name: t.string(),
	verified: t.bool().default(false),
	role: t.union([t.literal("admin"), t.literal("member")]).default("member"),
	createdAt: t.date().default(() => new Date("2024-01-01T00:00:00Z")),
	seen: t.date().default(expr("time::now()")),
	bio: t.option(t.string()),
});
const db = orm(new Surreal(), user);

function render(q: {
	[__display]: (c: ReturnType<typeof displayContext>) => string;
}) {
	const ctx = displayContext();
	const sql = q[__display](ctx);
	return { sql, vars: ctx.variables };
}

describe("field defaults", () => {
	test("type: output stays non-optional, input becomes optional", () => {
		type Out = (typeof user)["type"];
		assertType<
			Equal<
				Out,
				{
					id: RecordId<"user">;
					name: string;
					verified: boolean;
					role: "admin" | "member";
					createdAt: Date;
					seen: Date;
					bio: string | undefined;
				}
			>
		>();
		// Only `name` is required on create.
		db.create("user").content({ name: "Ann" });
		// @ts-expect-error name has no default
		db.create("user").content({ verified: true });
		// @ts-expect-error default values are still type-checked
		db.create("user").content({ name: "Ann", verified: "yes" });
	});

	test(".default() returns a copy and keeps the type's class", () => {
		const base = t.bool();
		const withDefault = base.default(true);
		expect((base as Partial<HasDefault>)._default).toBeUndefined();
		expect(withDefault._default).toBe(true);
		expect(withDefault.name).toBe("bool");
		expect(withDefault.validate(false)).toBe(true);
	});

	test("CONTENT gets static, function and expression defaults", () => {
		const { sql, vars } = render(db.create("user").content({ name: "Ann" }));
		expect(sql).toContain("CONTENT {");
		expect(sql).toContain("seen: time::now()");
		const values = Object.values(vars);
		expect(values).toContainEqual(false);
		expect(values).toContainEqual("member");
		expect(values).toContainEqual(new Date("2024-01-01T00:00:00Z"));
	});

	test("CONTENT without expression defaults stays a single bound object", () => {
		const plain = table("plain", { a: t.string(), b: t.number().default(1) });
		const q = orm(new Surreal(), plain).create("plain").content({ a: "x" });
		const { sql, vars } = render(q);
		expect(sql).toBe("(CREATE $_v0 CONTENT $_v1)");
		expect(vars._v1).toEqual({ a: "x", b: 1 });
	});

	test("explicit values override defaults", () => {
		const { vars } = render(
			db.create("user").content({ name: "Ann", verified: true }),
		);
		expect(Object.values(vars)).toContain(true);
		expect(Object.values(vars)).not.toContain(false);
	});

	test("SET fills only missing fields", () => {
		const { sql } = render(
			db.create("user").set({ name: "Ann", verified: true }),
		);
		expect(sql).toContain("name =");
		expect(sql).toContain("role =");
		expect(sql).toContain("createdAt =");
		expect(sql).toContain("seen = time::now()");
		expect(sql.match(/verified =/g)).toHaveLength(1);
	});

	test("bare CREATE becomes SET with defaults", () => {
		const { sql } = render(db.create("user"));
		expect(sql).toContain(" SET verified =");
		expect(sql).not.toContain("name =");
	});

	test("undefined counts as missing", () => {
		const { vars } = render(
			db.create("user").content({ name: "Ann", verified: undefined }),
		);
		expect(Object.values(vars)).toContainEqual(false);
	});

	test("function defaults are re-evaluated per query render", () => {
		let n = 0;
		const tb = table("counter", { n: t.number().default(() => ++n) });
		const q = orm(new Surreal(), tb).create("counter");
		expect(render(q).vars._v1).toBe(1);
		expect(render(q).vars._v1).toBe(2);
	});

	test("INSERT object-style fills each row", () => {
		const { sql, vars } = render(
			db.insert("user", [{ name: "A" }, { name: "B", verified: true }]),
		);
		expect(sql).toContain("INSERT INTO");
		expect(sql.match(/seen: time::now\(\)/g)).toHaveLength(2);
		expect(Object.values(vars)).toContain(true);
	});

	test("INSERT fields/values appends missing defaults", () => {
		const { sql } = render(
			db.insert("user").fields(["name"]).values(["A"], ["B"]),
		);
		expect(sql).toContain("(name, verified, role, createdAt, seen)");
		expect(sql.match(/time::now\(\)/g)).toHaveLength(2);
	});

	test("tables without defaults are untouched", () => {
		const plain = table("p", { a: t.string() });
		const { sql } = render(
			orm(new Surreal(), plain).create("p").content({ a: "x" }),
		);
		expect(sql).toBe("(CREATE $_v0 CONTENT $_v1)");
	});
});
