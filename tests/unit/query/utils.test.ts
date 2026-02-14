import { describe, expect, test } from "bun:test";
import { displayContext } from "../../../src";
import {
	generateSetAssignments,
	processSetOperators,
} from "../../../src/query/utils";

describe("processSetOperators", () => {
	test("passes through plain values", () => {
		const result = processSetOperators({ name: "Alice", age: 30 });
		expect(result).toEqual({ name: "Alice", age: 30 });
	});

	test("passes through += operators", () => {
		const result = processSetOperators({ age: { "+=": 1 } });
		expect(result).toEqual({ age: { "+=": 1 } });
	});

	test("passes through -= operators", () => {
		const result = processSetOperators({ age: { "-=": 1 } });
		expect(result).toEqual({ age: { "-=": 1 } });
	});

	test("handles mixed keys", () => {
		const result = processSetOperators({
			name: "Alice",
			age: { "+=": 1 },
			score: { "-=": 5 },
		});
		expect(result).toEqual({
			name: "Alice",
			age: { "+=": 1 },
			score: { "-=": 5 },
		});
	});

	test("handles empty object", () => {
		const result = processSetOperators({});
		expect(result).toEqual({});
	});

	test("handles falsy values", () => {
		const result = processSetOperators({
			a: 0,
			b: "",
			c: false,
			d: null,
		});
		expect(result).toEqual({ a: 0, b: "", c: false, d: null });
	});
});

describe("generateSetAssignments", () => {
	test("generates regular assignment", () => {
		const ctx = displayContext();
		const result = generateSetAssignments({ name: "Alice" }, ctx);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatch(/^name = \$_v\d+$/);
	});

	test("generates += assignment", () => {
		const ctx = displayContext();
		const result = generateSetAssignments({ age: { "+=": 1 } }, ctx);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatch(/^age \+= \$_v\d+$/);
	});

	test("generates -= assignment", () => {
		const ctx = displayContext();
		const result = generateSetAssignments({ score: { "-=": 5 } }, ctx);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatch(/^score -= \$_v\d+$/);
	});

	test("generates mixed assignments", () => {
		const ctx = displayContext();
		const result = generateSetAssignments(
			{
				name: "Alice",
				age: { "+=": 1 },
				score: { "-=": 5 },
			},
			ctx,
		);
		expect(result).toHaveLength(3);
		expect(result[0]).toContain("name =");
		expect(result[1]).toContain("age +=");
		expect(result[2]).toContain("score -=");
	});

	test("stores values in context variables", () => {
		const ctx = displayContext();
		generateSetAssignments({ name: "Alice" }, ctx);
		expect(Object.values(ctx.variables)).toContain("Alice");
	});

	test("returns empty array for empty object", () => {
		const ctx = displayContext();
		const result = generateSetAssignments({}, ctx);
		expect(result).toEqual([]);
	});
});
