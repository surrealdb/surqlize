import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import {
	type CreateInput,
	edge,
	expr,
	OrmError,
	orm,
	t,
	table,
	ValidationError,
} from "../../../src";

// Compile-time equality assertion helper.
type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;
const assertType = <_T extends true>() => {};

const user = table("user", {
	name: t.string(),
	age: t.number(),
	nick: t.option(t.string()),
	role: t.string().default("member"),
	address: t.object({ city: t.string(), zip: t.option(t.string()) }),
	tags: t.array(t.string()),
	friend: t.option(t.record("user")),
	born: t.date().default(expr("time::now()")),
}).computed("shout", t.string(), (row) => row.name.uppercase());

const knows = edge("user", "knows", "user", {
	since: t.number(),
	note: t.string().default(""),
});

const valid = {
	name: "Ada",
	age: 36,
	address: { city: "London", zip: undefined },
	tags: ["a", "b"],
};

const raw = orm(new Surreal(), user, knows);
const db = raw.validated();

function issuesOf(fn: () => unknown) {
	try {
		fn();
	} catch (e) {
		expect(e).toBeInstanceOf(ValidationError);
		return (e as ValidationError).issues;
	}
	throw new Error("expected a ValidationError");
}

describe("TableSchema.safeParse / parse", () => {
	test("accepts valid create input; defaults, options and id are optional", () => {
		const result = user.safeParse(valid);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe(valid);
			// Type-level: defaults and options are optional, computed is absent.
			type D = typeof result.data;
			assertType<Equal<"shout" extends keyof D ? true : false, false>>();
			assertType<Equal<"id" extends keyof D ? true : false, false>>();
			assertType<
				Equal<
					// biome-ignore lint/complexity/noBannedTypes: checks that the fields are optional
					{} extends Pick<D, "role" | "nick" | "born" | "friend">
						? true
						: false,
					true
				>
			>();
			// biome-ignore lint/complexity/noBannedTypes: checks that the field is required
			assertType<Equal<{} extends Pick<D, "name"> ? true : false, false>>();
			assertType<Equal<D["age"], number>>();
			assertType<Equal<D, CreateInput<typeof user.schema>>>();
		}
	});

	test("lists every failing field with path, expected type and received value", () => {
		const result = user.safeParse({
			name: 42,
			address: { city: 1 },
			tags: ["a", 2, 3],
			nick: 5,
			role: null,
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		const byPath = Object.fromEntries(
			result.error.issues.map((i) => [i.path, i]),
		);
		expect(Object.keys(byPath).sort()).toEqual([
			"address.city",
			"age",
			"name",
			"nick",
			"role",
			"tags[1]",
			"tags[2]",
		]);
		expect(byPath.name).toMatchObject({ expected: "string", received: 42 });
		expect(byPath.age).toMatchObject({
			expected: "number",
			received: undefined,
		});
		expect(byPath["tags[2]"]?.received).toBe(3);
		expect(result.error).toBeInstanceOf(OrmError);
		expect(result.error.table).toBe("user");
		expect(result.error.message).toContain("7 validation errors");
		expect(result.error.message).toContain(
			"name: expected string, received 42",
		);
	});

	test("rejects a computed field and a non-object", () => {
		expect(user.safeParse({ ...valid, shout: "X" })).toMatchObject({
			success: false,
			error: { issues: [{ path: "shout" }] },
		});
		expect(user.safeParse("nope")).toMatchObject({
			success: false,
			error: { issues: [{ path: "(root)", expected: "object" }] },
		});
	});

	test("record links are checked against the linked table", () => {
		expect(
			user.safeParse({ ...valid, friend: new RecordId("user", 1) }).success,
		).toBe(true);
		const bad = user.safeParse({ ...valid, friend: new RecordId("post", 1) });
		expect(bad.success).toBe(false);
	});

	test("update mode only checks the fields present", () => {
		expect(user.safeParse({ age: 3 }, { mode: "update" }).success).toBe(true);
		const bad = user.safeParse({ age: "3", name: 1 }, { mode: "update" });
		expect(bad.success ? [] : bad.error.issues.map((i) => i.path)).toEqual([
			"name",
			"age",
		]);
	});

	test("row mode requires id and computed fields", () => {
		const row = {
			...valid,
			id: new RecordId("user", 1),
			role: "member",
			born: new Date(),
			shout: "ADA",
		};
		expect(user.safeParse(row, { mode: "row" }).success).toBe(true);
		const { shout: _s, ...partial } = row;
		expect(user.safeParse(partial, { mode: "row" }).success).toBe(false);
	});

	test("parse throws a ValidationError, returns the typed data otherwise", () => {
		expect(user.parse(valid)).toBe(valid);
		expect(() => user.parse({})).toThrow(ValidationError);
	});

	test("edge create mode does not require id, in or out", () => {
		expect(knows.safeParse({ since: 1 }).success).toBe(true);
		const bad = knows.safeParse({ since: "x" });
		expect(bad.success).toBe(false);
	});

	test("a SurrealQL expression for a field is not checked client-side", () => {
		expect(
			user.safeParse({ ...valid, born: expr("time::now()") }).success,
		).toBe(true);
	});
});

describe("opt-in validation of writes", () => {
	test("is off by default", () => {
		expect(() =>
			raw
				.create("user")
				.content({ name: 1 } as never)
				.prepare(),
		).not.toThrow();
		expect(raw.validation).toBe(false);
		expect(db.validation).toBe(true);
	});

	test("create().content() reports every issue before sending", () => {
		const issues = issuesOf(() =>
			db
				.create("user")
				.content({ name: 1, age: "x" } as never)
				.prepare(),
		);
		expect(issues.map((i) => i.path)).toEqual(
			expect.arrayContaining(["name", "age", "address", "tags"]),
		);
		expect(issues).toHaveLength(4);
	});

	test("accepts valid create content without defaulted / optional / id fields", () => {
		expect(() => db.create("user").content(valid).prepare()).not.toThrow();
	});

	test("rejects a computed field on write", () => {
		const issues = issuesOf(() =>
			db
				.create("user")
				.content({ ...valid, shout: "x" } as never)
				.prepare(),
		);
		expect(issues.map((i) => i.path)).toEqual(["shout"]);
		expect(() =>
			db
				.update("user")
				.set({ shout: "x" } as never)
				.prepare(),
		).toThrow(ValidationError);
	});

	test("set validates dotted paths and += operands", () => {
		expect(() =>
			db
				.update("user")
				.set({ "address.city": 1, age: { "+=": "x" } } as never)
				.prepare(),
		).toThrow(ValidationError);
		expect(() =>
			db
				.update("user")
				.set({
					"address.city": "Paris",
					age: { "+=": 1 },
					tags: { "+=": "c" },
				} as never)
				.prepare(),
		).not.toThrow();
	});

	test("merge and upsert content are partial", () => {
		expect(() => db.update("user").merge({ age: 1 }).prepare()).not.toThrow();
		expect(() =>
			db
				.upsert("user")
				.merge({ age: "1" } as never)
				.prepare(),
		).toThrow(ValidationError);
		expect(() =>
			db.upsert("user", 1).content({ age: 1 }).prepare(),
		).not.toThrow();
	});

	test("insert checks each row, with its index in the path", () => {
		const issues = issuesOf(() =>
			db.insert("user", [valid, { ...valid, age: "x" }]).prepare(),
		);
		expect(issues.map((i) => i.path)).toEqual(["[1].age"]);
		expect(() =>
			db
				.insert("user")
				.fields(["name", "age", "address", "tags"])
				.values(["a", 1, { city: "x" }, []], ["b", "2", { city: "y" }, []])
				.prepare(),
		).toThrow(ValidationError);
		expect(() => db.insert("user", [valid]).prepare()).not.toThrow();
	});

	test("relate content is checked against the edge", () => {
		const a = new RecordId("user", 1);
		const b = new RecordId("user", 2);
		expect(() =>
			db
				.relate("knows", a, b)
				.content({ since: "x" } as never)
				.prepare(),
		).toThrow(ValidationError);
		expect(() =>
			db
				.relate("knows", a, b)
				.content({ since: 1 } as never)
				.prepare(),
		).not.toThrow();
	});

	test("per-query opt-in and opt-out", () => {
		const bad = { name: 1 } as never;
		expect(() => raw.create("user").content(bad).validated().prepare()).toThrow(
			ValidationError,
		);
		expect(() =>
			db.create("user").content(bad).validated(false).prepare(),
		).not.toThrow();
	});

	test("execute rejects before reaching the connection", async () => {
		await expect(
			db
				.create("user")
				.content({ name: 1 } as never)
				.execute(),
		).rejects.toBeInstanceOf(ValidationError);
	});

	test("a batch validates every query", async () => {
		await expect(
			db
				.batch(
					db.create("user").content(valid),
					db.create("user").content({ name: 1 } as never),
				)
				.execute(),
		).rejects.toBeInstanceOf(ValidationError);
	});

	test("validated() is preserved by withSignal()", () => {
		expect(db.withSignal(undefined).validation).toBe(true);
	});
});
