import { describe, expect, test } from "bun:test";
import { displayContext, TypeParseError, t } from "../../../src";
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
});
