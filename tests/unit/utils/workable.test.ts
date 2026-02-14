import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { displayContext, orm, t, table } from "../../../src";
import {
	__ctx,
	__display,
	__type,
	intoWorkable,
	isWorkable,
	sanitizeWorkable,
	workableGet,
} from "../../../src/utils/workable";

describe("isWorkable", () => {
	test("returns true for objects with __ctx", () => {
		const obj = {
			[__ctx]: { orm: {} as never, id: Symbol() },
			[__display]: () => "",
			[__type]: t.string(),
		};
		expect(isWorkable(obj)).toBe(true);
	});

	test("returns false for null", () => {
		expect(isWorkable(null)).toBe(false);
	});

	test("returns false for undefined", () => {
		expect(isWorkable(undefined)).toBe(false);
	});

	test("returns false for primitives", () => {
		expect(isWorkable("hello")).toBe(false);
		expect(isWorkable(42)).toBe(false);
		expect(isWorkable(true)).toBe(false);
	});

	test("returns false for plain objects without __ctx", () => {
		expect(isWorkable({})).toBe(false);
		expect(isWorkable({ name: "test" })).toBe(false);
	});
});

describe("intoWorkable", () => {
	const ctx = { orm: {} as never, id: Symbol() };
	const type = t.string();

	test("wraps raw value into workable", () => {
		const result = intoWorkable(ctx, type, "hello");
		expect(isWorkable(result)).toBe(true);
		expect(result[__type]).toBe(type);
		expect(result[__ctx]).toBe(ctx);
	});

	test("wrapped workable display uses ctx.var", () => {
		const result = intoWorkable(ctx, type, "hello");
		const dCtx = displayContext();
		const display = result[__display](dCtx);
		expect(display).toMatch(/^\$_v\d+$/); // parameterized variable
		expect(Object.values(dCtx.variables)).toContain("hello");
	});

	test("passes through already-workable value", () => {
		const existing = {
			[__ctx]: ctx,
			[__display]: () => "existing",
			[__type]: type,
		};
		const result = intoWorkable(ctx, type, existing as never);
		expect(result[__display]({} as never)).toBe("existing");
	});
});

describe("workableGet", () => {
	test("returns child workable with appended path", () => {
		const user = table("user", {
			name: t.object({ first: t.string() }),
		});
		const db = orm(new Surreal(), user);

		const ctx = displayContext();

		// Build a workable for $this and get the "name" property
		const parentWorkable = {
			[__ctx]: { orm: db, id: Symbol() },
			[__display]: () => "$this",
			[__type]: user.schema,
		};

		const child = workableGet(parentWorkable, "name");
		const display = child[__display](ctx);
		expect(display).toBe('$this["name"]');
	});

	test("returns correct type for known property", () => {
		const schema = t.object({ age: t.number() });
		const workable = {
			[__ctx]: { orm: {} as never, id: Symbol() },
			[__display]: () => "$this",
			[__type]: schema,
		};

		const child = workableGet(workable, "age");
		expect(child[__type].name).toBe("number");
	});
});

describe("sanitizeWorkable", () => {
	test("returns a new object with only workable properties", () => {
		const ctx = { orm: {} as never, id: Symbol() };
		const displayFn = () => "test";
		const type = t.string();

		const input = {
			[__ctx]: ctx,
			[__display]: displayFn,
			[__type]: type,
			extra: "should not be in output",
		};

		const result = sanitizeWorkable(input as never);
		expect(result[__ctx]).toBe(ctx);
		expect(result[__display]).toBe(displayFn);
		expect(result[__type]).toBe(type);
		expect((result as Record<string, unknown>).extra).toBeUndefined();
	});
});
