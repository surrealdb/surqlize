import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import {
	__display,
	displayContext,
	FunctionSchema,
	fn,
	orm,
	t,
	table,
} from "../../../src";

describe("FunctionSchema", () => {
	test("creates schema with name, params, and return type", () => {
		const schema = new FunctionSchema("greet", [t.string()], t.string());

		expect(schema.name).toBe("greet");
		expect(schema.params).toHaveLength(1);
		expect(schema.params[0]!.name).toBe("string");
		expect(schema.returns.name).toBe("string");
	});

	test("creates schema with multiple params", () => {
		const schema = new FunctionSchema(
			"add",
			[t.number(), t.number()],
			t.number(),
		);

		expect(schema.name).toBe("add");
		expect(schema.params).toHaveLength(2);
		expect(schema.params[0]!.name).toBe("number");
		expect(schema.params[1]!.name).toBe("number");
		expect(schema.returns.name).toBe("number");
	});

	test("creates schema with no params", () => {
		const schema = new FunctionSchema("now", [], t.date());

		expect(schema.name).toBe("now");
		expect(schema.params).toHaveLength(0);
		expect(schema.returns.name).toBe("date");
	});
});

describe("fn() factory", () => {
	const user = table("user", {
		name: t.string(),
		age: t.number(),
		email: t.string(),
	});

	const db = orm(new Surreal(), user);

	test("returns a callable with .schema property", () => {
		const greet = fn("greet", [t.string()], t.string());

		expect(typeof greet).toBe("function");
		expect(greet.schema).toBeInstanceOf(FunctionSchema);
		expect(greet.schema.name).toBe("greet");
	});

	test("generates fn::name() SurrealQL in return projection", () => {
		const greet = fn("greet", [t.string()], t.string());

		const query = db.select("user").return((u) => ({
			greeting: greet(u, u.name),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("fn::greet(");
	});

	test("generates fn::name() SurrealQL in where clause", () => {
		const isActive = fn("is_active", [t.number()], t.bool());

		const query = db.select("user").where((u) => isActive(u, u.age));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("WHERE");
		expect(result).toContain("fn::is_active(");
	});

	test("generates fn::name() with no arguments", () => {
		const getDefault = fn("get_default", [], t.string());

		const query = db.select("user").return((u) => ({
			default: getDefault(u),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("fn::get_default()");
	});

	test("generates fn::name() with multiple arguments", () => {
		const combine = fn("combine", [t.string(), t.string()], t.string());

		const query = db.select("user").return((u) => ({
			full: combine(u, u.name, u.email),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("fn::combine(");
	});

	test("preserves namespaced function names", () => {
		const myFn = fn("utils::format", [t.string()], t.string());

		const query = db.select("user").return((u) => ({
			formatted: myFn(u, u.name),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("fn::utils::format(");
	});

	test("generates fn::name() in UPDATE return projection", () => {
		const formatAge = fn("format_age", [t.number()], t.string());

		const query = db
			.update("user", "alice")
			.set({ age: 32 })
			.return((u) => ({
				formatted: formatAge(u, u.age),
			}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("fn::format_age(");
	});

	test("generates fn::name() in CREATE return projection", () => {
		const greet = fn("greet", [t.string()], t.string());

		const query = db
			.create("user")
			.set({ name: "Alice", age: 30, email: "alice@example.com" })
			.return((u) => ({
				greeting: greet(u, u.name),
			}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		expect(result).toContain("fn::greet(");
	});

	test("generates nested fn() calls", () => {
		const inner = fn("inner", [t.string()], t.string());
		const outer = fn("outer", [t.string()], t.string());

		const query = db.select("user").return((u) => ({
			result: outer(u, inner(u, u.name)),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("fn::outer(fn::inner(");
	});

	test("fn() with complex return type carries correct __type", () => {
		const getProfile = fn(
			"get_profile",
			[t.string()],
			t.object({ name: t.string(), score: t.number() }),
		);

		expect(getProfile.schema.returns.name).toBe("object");
		expect(getProfile.schema.returns.schema).toHaveProperty("name");
		expect(getProfile.schema.returns.schema).toHaveProperty("score");
		expect(getProfile.schema.returns.schema.name.name).toBe("string");
		expect(getProfile.schema.returns.schema.score.name).toBe("number");
	});
});
