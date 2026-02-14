import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

describe("BATCH queries", () => {
	const user = table("user", {
		name: t.string(),
		age: t.number(),
		email: t.string(),
	});

	const post = table("post", {
		title: t.string(),
		body: t.string(),
	});

	const db = orm(new Surreal(), user, post);

	test("generates BEGIN/COMMIT wrapping", () => {
		const b = db.batch(db.create("user").set({ name: "Alice", age: 30 }));
		const result = b.toString();

		expect(result).toStartWith("BEGIN TRANSACTION;");
		expect(result).toEndWith("COMMIT TRANSACTION;");
	});

	test("includes multiple statements", () => {
		const b = db.batch(
			db.create("user").set({ name: "Alice", age: 30 }),
			db.update("user").set({ age: 31 }),
		);
		const result = b.toString();

		expect(result).toContain("CREATE");
		expect(result).toContain("UPDATE");
	});

	test("shares variables across queries via DisplayContext", () => {
		const b = db.batch(
			db.create("user").set({ name: "Alice", age: 30 }),
			db.create("user").set({ name: "Bob", age: 25 }),
		);
		const ctx = displayContext();
		b[__display](ctx);

		// Variables should include values from both queries
		const vars = Object.values(ctx.variables);
		expect(vars).toContainEqual("Alice");
		expect(vars).toContainEqual("Bob");
		expect(vars).toContainEqual(30);
		expect(vars).toContainEqual(25);
	});

	test("strips parentheses from individual queries", () => {
		const b = db.batch(db.select("user"));
		const result = b.toString();

		// Should not have nested parentheses from individual queries
		expect(result).not.toContain("(SELECT");
		expect(result).toContain("SELECT * FROM");
	});

	test("generates correct SurrealQL for mixed operations", () => {
		const b = db.batch(
			db.create("user").set({ name: "Alice" }),
			db.select("user"),
			db.delete("user"),
		);
		const result = b.toString();

		expect(result).toStartWith("BEGIN TRANSACTION;");
		expect(result).toContain("CREATE");
		expect(result).toContain("SELECT");
		expect(result).toContain("DELETE");
		expect(result).toEndWith("COMMIT TRANSACTION;");
	});

	test("generates correct SurrealQL for single query", () => {
		const b = db.batch(
			db.create("post").set({ title: "Hello", body: "World" }),
		);
		const result = b.toString();

		expect(result).toStartWith("BEGIN TRANSACTION;");
		expect(result).toContain("CREATE");
		expect(result).toContain("SET");
		expect(result).toEndWith("COMMIT TRANSACTION;");
	});

	test("statements are separated by semicolons", () => {
		const b = db.batch(
			db.create("user").set({ name: "Alice" }),
			db.create("post").set({ title: "Post" }),
		);
		const result = b.toString();

		// Match: "BEGIN TRANSACTION; <stmt1>; <stmt2>; COMMIT TRANSACTION;"
		const parts = result.split("; ");
		expect(parts.length).toBeGreaterThanOrEqual(4);
		expect(parts[0]).toBe("BEGIN TRANSACTION");
		expect(parts[parts.length - 1]).toBe("COMMIT TRANSACTION;");
	});

	test("toString matches __display output", () => {
		const b = db.batch(db.select("user").where(($this) => $this.age.gt(18)));
		const str = b.toString();
		const ctx = displayContext();
		const display = b[__display](ctx);

		expect(str).toContain("BEGIN TRANSACTION;");
		expect(display).toContain("BEGIN TRANSACTION;");
		expect(str).toContain("WHERE");
		expect(display).toContain("WHERE");
	});

	test("Orm has batch method", () => {
		expect(db).toHaveProperty("batch");
		expect(typeof db.batch).toBe("function");
	});
});
