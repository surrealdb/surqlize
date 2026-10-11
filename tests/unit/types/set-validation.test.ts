import { describe, expect, test } from "bun:test";
import { t, table } from "../../../src";
import { checkValue } from "../../../src/validation";

describe("validation of set fields", () => {
	const type = t.set(t.string());

	test("accepts a Set, rejects an array", () => {
		expect(checkValue(type, new Set(["a"]))).toEqual([]);
		const [issue] = checkValue(type, ["a"]);
		expect(issue?.expected).toBe("set of string");
		expect(issue?.message).toContain("received array of 1");
	});

	test("reports a bad member with an indexed path", () => {
		const [issue] = checkValue(t.object({ tags: type }), {
			tags: new Set(["a", 2]),
		});
		expect(issue?.path).toBe("tags[1]");
	});

	test("reports a set over its maximum", () => {
		const [issue] = checkValue(t.set(t.string(), 1), new Set(["a", "b"]));
		expect(issue?.expected).toBe("at most 1 members");
		expect(issue?.message).toContain("received set of 2");
	});

	test("is checked inside a table schema", () => {
		const doc = table("doc", { tags: type });
		expect(doc.safeParse({ tags: new Set(["a"]) }).success).toBe(true);
		expect(doc.safeParse({ tags: ["a"] }).success).toBe(false);
	});

	test("implements Standard Schema", () => {
		const std = type["~standard"];
		expect(std.validate(new Set(["a"]))).toEqual({ value: new Set(["a"]) });
		const result = std.validate(new Set([1]));
		expect(result.issues?.[0]?.path).toEqual([0]);
		expect(std.validate(["a"]).issues).toBeDefined();
	});
});
