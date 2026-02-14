import { describe, expect, test } from "bun:test";
import { displayContext, OrmError, TypeParseError, t } from "../../../src";
import type { AbstractType } from "../../../src/types/classes";
import { inheritableIntoWorkable } from "../../../src/utils/inheritable";
import {
	__ctx,
	__display,
	__type,
	isWorkable,
	type Workable,
	type WorkableContext,
} from "../../../src/utils/workable";

describe("inheritableIntoWorkable", () => {
	const ctx: WorkableContext = { orm: {} as never, id: Symbol() };

	function makeWorkable<T extends AbstractType>(
		name: string,
		type: T,
	): Workable<WorkableContext, T> {
		return {
			[__ctx]: ctx,
			[__display]: () => name,
			[__type]: type,
		};
	}

	test("passes through already-workable value", () => {
		const workable = makeWorkable("$this.name", t.string());
		const result = inheritableIntoWorkable(workable);
		expect(result[__display]({} as never)).toBe("$this.name");
	});

	test("converts flat object of workables into ObjectType workable", () => {
		const obj = {
			firstName: makeWorkable("$this.first", t.string()),
			age: makeWorkable("$this.age", t.number()),
		};

		const result = inheritableIntoWorkable(obj);
		expect(isWorkable(result)).toBe(true);
		expect(result[__type].name).toBe("object");
	});

	test("flat object display renders { key: val } format", () => {
		const obj = {
			a: makeWorkable("A", t.string()),
			b: makeWorkable("B", t.string()),
		};

		const result = inheritableIntoWorkable(obj);
		const dCtx = displayContext();
		const display = result[__display](dCtx);
		expect(display).toBe("{ a: A, b: B }");
	});

	test("nested object is recursively converted", () => {
		const obj = {
			nested: {
				inner: makeWorkable("$this.inner", t.string()),
			},
		};

		const result = inheritableIntoWorkable(obj);
		expect(isWorkable(result)).toBe(true);
		expect(result[__type].name).toBe("object");

		const dCtx = displayContext();
		const display = result[__display](dCtx);
		expect(display).toContain("nested:");
		expect(display).toContain("inner:");
	});

	test("throws TypeParseError for non-object input", () => {
		expect(() => inheritableIntoWorkable("string" as never)).toThrow(
			"Expected object but found string",
		);

		try {
			inheritableIntoWorkable("string" as never);
		} catch (err) {
			expect(err).toBeInstanceOf(TypeParseError);
		}
	});

	test("throws TypeParseError for null input", () => {
		expect(() => inheritableIntoWorkable(null as never)).toThrow(
			"Expected object but found null",
		);

		try {
			inheritableIntoWorkable(null as never);
		} catch (err) {
			expect(err).toBeInstanceOf(TypeParseError);
		}
	});

	test("converts flat array of workables into ArrayType workable", () => {
		const arr = [
			makeWorkable("$this.name", t.string()),
			makeWorkable("$this.age", t.number()),
		];

		const result = inheritableIntoWorkable(arr);
		expect(isWorkable(result)).toBe(true);
		expect(result[__type].name).toBe("array");
	});

	test("flat array display renders [val, val] format", () => {
		const arr = [makeWorkable("A", t.string()), makeWorkable("B", t.number())];

		const result = inheritableIntoWorkable(arr);
		const dCtx = displayContext();
		const display = result[__display](dCtx);
		expect(display).toBe("[A, B]");
	});

	test("single-element array works correctly", () => {
		const arr = [makeWorkable("$this.name", t.string())];

		const result = inheritableIntoWorkable(arr);
		expect(isWorkable(result)).toBe(true);
		expect(result[__type].name).toBe("array");

		const dCtx = displayContext();
		const display = result[__display](dCtx);
		expect(display).toBe("[$this.name]");
	});

	test("array with nested object is recursively converted", () => {
		const arr = [
			makeWorkable("A", t.string()),
			{
				inner: makeWorkable("B", t.number()),
			},
		];

		const result = inheritableIntoWorkable(arr);
		expect(isWorkable(result)).toBe(true);
		expect(result[__type].name).toBe("array");

		const dCtx = displayContext();
		const display = result[__display](dCtx);
		expect(display).toBe("[A, { inner: B }]");
	});

	test("array with nested array is recursively converted", () => {
		const arr = [
			makeWorkable("A", t.string()),
			[makeWorkable("B", t.number()), makeWorkable("C", t.bool())],
		];

		// Nested arrays are handled at runtime but not at the type level,
		// so we cast through unknown to test runtime behavior.
		const result = inheritableIntoWorkable(
			arr as unknown as Workable<WorkableContext>[],
		);
		expect(isWorkable(result)).toBe(true);
		expect(result[__type].name).toBe("array");

		const dCtx = displayContext();
		const display = result[__display](dCtx);
		expect(display).toBe("[A, [B, C]]");
	});

	test("throws OrmError for empty array", () => {
		expect(() => inheritableIntoWorkable([] as never)).toThrow(
			"Cannot convert empty array to workable",
		);

		try {
			inheritableIntoWorkable([] as never);
		} catch (err) {
			expect(err).toBeInstanceOf(OrmError);
		}
	});
});
