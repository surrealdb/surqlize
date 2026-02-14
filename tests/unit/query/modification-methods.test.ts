import { describe, expect, test } from "bun:test";
import { displayContext } from "../../../src";
import {
	applyContent,
	applyMerge,
	applyPatch,
	applyReplace,
	applySet,
	applyUnset,
	checkModificationMode,
	displayModificationClause,
	type ModificationState,
} from "../../../src/query/modification-methods";

function createState(): ModificationState {
	return {};
}

describe("checkModificationMode", () => {
	test("no-op when current mode is undefined", () => {
		expect(() => checkModificationMode(undefined, "set")).not.toThrow();
	});

	test("no-op when current mode matches new mode", () => {
		expect(() => checkModificationMode("set", "set")).not.toThrow();
	});

	test("throws when modes conflict", () => {
		expect(() => checkModificationMode("set", "content")).toThrow(
			"Cannot use content() when set() has already been used",
		);
	});

	test("throws with correct mode names in message", () => {
		expect(() => checkModificationMode("merge", "patch")).toThrow(
			"Cannot use patch() when merge() has already been used",
		);
	});
});

describe("applySet", () => {
	test("sets modification mode to 'set'", () => {
		const state = createState();
		applySet(state, { age: 30 });
		expect(state._modificationMode).toBe("set");
	});

	test("stores data in _set", () => {
		const state = createState();
		applySet(state, { name: "Alice", age: 30 });
		expect(state._set).toEqual({ name: "Alice", age: 30 });
	});

	test("merges multiple applySet calls", () => {
		const state = createState();
		applySet(state, { name: "Alice" });
		applySet(state, { age: 30 });
		expect(state._set).toEqual({ name: "Alice", age: 30 });
	});

	test("throws when mode conflicts", () => {
		const state = createState();
		applyContent(state, {});
		expect(() => applySet(state, {})).toThrow();
	});
});

describe("applyUnset", () => {
	test("sets modification mode to 'set'", () => {
		const state = createState();
		applyUnset(state, ["email"]);
		expect(state._modificationMode).toBe("set");
	});

	test("stores fields in _unset", () => {
		const state = createState();
		applyUnset(state, ["email", "phone"]);
		expect(state._unset).toEqual(["email", "phone"]);
	});

	test("appends to existing _unset", () => {
		const state = createState();
		applyUnset(state, ["email"]);
		applyUnset(state, ["phone"]);
		expect(state._unset).toEqual(["email", "phone"]);
	});

	test("can combine with applySet (same mode)", () => {
		const state = createState();
		applySet(state, { name: "Alice" });
		applyUnset(state, ["email"]);
		expect(state._set).toEqual({ name: "Alice" });
		expect(state._unset).toEqual(["email"]);
	});
});

describe("applyContent", () => {
	test("sets modification mode to 'content'", () => {
		const state = createState();
		applyContent(state, { name: "Alice" });
		expect(state._modificationMode).toBe("content");
	});

	test("stores data in _content", () => {
		const state = createState();
		const data = { name: "Alice", age: 30 };
		applyContent(state, data);
		expect(state._content).toBe(data);
	});
});

describe("applyMerge", () => {
	test("sets modification mode to 'merge'", () => {
		const state = createState();
		applyMerge(state, { name: "Alice" });
		expect(state._modificationMode).toBe("merge");
	});

	test("stores data in _merge", () => {
		const state = createState();
		const data = { email: "new@example.com" };
		applyMerge(state, data);
		expect(state._merge).toBe(data);
	});
});

describe("applyPatch", () => {
	test("sets modification mode to 'patch'", () => {
		const state = createState();
		applyPatch(state, [{ op: "add", path: "/name", value: "Alice" }]);
		expect(state._modificationMode).toBe("patch");
	});

	test("stores operations in _patch", () => {
		const state = createState();
		const ops = [{ op: "replace" as const, path: "/age", value: 31 }];
		applyPatch(state, ops);
		expect(state._patch).toBe(ops);
	});
});

describe("applyReplace", () => {
	test("sets modification mode to 'replace'", () => {
		const state = createState();
		applyReplace(state, { name: "Alice" });
		expect(state._modificationMode).toBe("replace");
	});

	test("stores data in _replace", () => {
		const state = createState();
		const data = { name: "Alice" };
		applyReplace(state, data);
		expect(state._replace).toBe(data);
	});
});

describe("displayModificationClause", () => {
	test("returns empty string for empty state", () => {
		const state = createState();
		const ctx = displayContext();
		expect(displayModificationClause(state, ctx)).toBe("");
	});

	test("renders SET clause with regular values", () => {
		const state = createState();
		applySet(state, { name: "Alice", age: 30 });
		const ctx = displayContext();
		const result = displayModificationClause(state, ctx);
		expect(result).toContain("SET");
		expect(result).toContain("name =");
		expect(result).toContain("age =");
	});

	test("renders SET clause with += operator", () => {
		const state = createState();
		applySet(state, { age: { "+=": 1 } });
		const ctx = displayContext();
		const result = displayModificationClause(state, ctx);
		expect(result).toContain("age +=");
	});

	test("renders SET clause with -= operator", () => {
		const state = createState();
		applySet(state, { age: { "-=": 1 } });
		const ctx = displayContext();
		const result = displayModificationClause(state, ctx);
		expect(result).toContain("age -=");
	});

	test("renders UNSET clause", () => {
		const state = createState();
		applyUnset(state, ["email", "phone"]);
		const ctx = displayContext();
		const result = displayModificationClause(state, ctx);
		expect(result).toContain("UNSET email, phone");
	});

	test("renders combined SET and UNSET", () => {
		const state = createState();
		applySet(state, { name: "Alice" });
		applyUnset(state, ["email"]);
		const ctx = displayContext();
		const result = displayModificationClause(state, ctx);
		expect(result).toContain("SET");
		expect(result).toContain("name =");
		expect(result).toContain("UNSET email");
	});

	test("renders CONTENT clause", () => {
		const state = createState();
		applyContent(state, { name: "Alice" });
		const ctx = displayContext();
		const result = displayModificationClause(state, ctx);
		expect(result).toContain("CONTENT");
	});

	test("renders MERGE clause", () => {
		const state = createState();
		applyMerge(state, { email: "new@example.com" });
		const ctx = displayContext();
		const result = displayModificationClause(state, ctx);
		expect(result).toContain("MERGE");
	});

	test("renders PATCH clause", () => {
		const state = createState();
		applyPatch(state, [{ op: "add", path: "/name", value: "Alice" }]);
		const ctx = displayContext();
		const result = displayModificationClause(state, ctx);
		expect(result).toContain("PATCH");
	});

	test("renders REPLACE clause", () => {
		const state = createState();
		applyReplace(state, { name: "Alice" });
		const ctx = displayContext();
		const result = displayModificationClause(state, ctx);
		expect(result).toContain("REPLACE");
	});
});
