import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import { __display, displayContext, edge, orm, t, table } from "../../../src";

const user = table("user", {
	name: t.object({
		first: t.string(),
		last: t.string(),
	}),
	age: t.number(),
	email: t.string(),
	tags: t.array(t.string()),
});

const post = table("post", {
	title: t.string(),
	body: t.string(),
	author: t.record("user"),
});

const authored = edge("user", "authored", "post", {
	created: t.date(),
});

const db = orm(new Surreal(), user, post, authored);

// ─── SELECT ──────────────────────────────────────────────────────────────────

describe("SELECT return projections", () => {
	test("RETURN VALUE <field> — single field", () => {
		const query = db.select("user").return((r) => r.name);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT VALUE");
		expect(result).toContain('$this["name"]');
	});

	test("RETURN VALUE <nested field> — nested field access", () => {
		const query = db.select("user").return((r) => r.name.first);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT VALUE");
		expect(result).toContain('$this["name"]["first"]');
	});

	test("RETURN { ... } — flat object", () => {
		const query = db.select("user").return((r) => ({
			name: r.name,
			age: r.age,
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT VALUE");
		expect(result).toContain("{ name:");
		expect(result).toContain("age:");
	});

	test("RETURN { ... } — nested object", () => {
		const query = db.select("user").return((r) => ({
			info: {
				fullName: r.name,
				contact: r.email,
			},
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT VALUE");
		expect(result).toContain("info:");
		expect(result).toContain("fullName:");
		expect(result).toContain("contact:");
	});

	test("RETURN [ ... ] — flat array", () => {
		const query = db.select("user").return((r) => [r.name, r.age]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT VALUE");
		expect(result).toMatch(/\[.*\$this\["name"\].*,.*\$this\["age"\].*\]/);
	});

	test("RETURN [ ... ] — array with nested field access", () => {
		const query = db
			.select("user")
			.return((r) => [r.name.first, r.name.last, r.age]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT VALUE");
		expect(result).toContain("[");
		expect(result).toContain('$this["name"]["first"]');
		expect(result).toContain('$this["name"]["last"]');
		expect(result).toContain('$this["age"]');
		expect(result).toContain("]");
	});

	test("RETURN [ ... ] — array containing an object", () => {
		const query = db
			.select("user")
			.return((r) => [r.email, { fullName: r.name }]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT VALUE");
		expect(result).toMatch(/\[.*,.*\{.*fullName:.*\}.*\]/);
	});

	test("RETURN { ... } — object containing an array", () => {
		const query = db.select("user").return((r) => ({
			fields: [r.name.first, r.age],
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT VALUE");
		expect(result).toContain("fields:");
		expect(result).toContain("[");
		expect(result).toContain("]");
	});

	test("RETURN [ ... ] — nested arrays", () => {
		const query = db
			.select("user")
			.return((r) => [r.email, [r.name.first, r.name.last]]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT VALUE");
		// Should contain nested bracket structure
		expect(result).toMatch(/\[.*\[.*\].*\]/);
	});

	test("RETURN { ... } — deeply nested object with array", () => {
		const query = db.select("user").return((r) => ({
			profile: {
				names: [r.name.first, r.name.last],
				meta: {
					email: r.email,
				},
			},
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT VALUE");
		expect(result).toContain("profile:");
		expect(result).toContain("names:");
		expect(result).toContain("meta:");
		expect(result).toContain("email:");
	});

	test("single field return produces correct type name", () => {
		const query = db.select("user").return((r) => r.age);
		expect(query[__display](displayContext())).toContain("SELECT VALUE");
	});
});

// ─── CREATE ──────────────────────────────────────────────────────────────────

describe("CREATE return projections", () => {
	test("RETURN VALUE <field> — single field", () => {
		const query = db
			.create("user")
			.set({ name: "Test", age: 1 })
			.return((r) => r.name);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("CREATE");
		expect(result).toContain("RETURN VALUE");
		expect(result).toContain('$this["name"]');
	});

	test("RETURN VALUE { ... } — object", () => {
		const query = db
			.create("user")
			.set({ name: "Test", age: 1 })
			.return((r) => ({ name: r.name, email: r.email }));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toContain("{ name:");
		expect(result).toContain("email:");
	});

	test("RETURN VALUE [ ... ] — array", () => {
		const query = db
			.create("user")
			.set({ name: "Test", age: 1 })
			.return((r) => [r.name.first, r.age]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toContain("[");
		expect(result).toContain("]");
	});

	test("RETURN VALUE { ... } — object with nested array", () => {
		const query = db
			.create("user")
			.set({ name: "Test", age: 1 })
			.return((r) => ({
				fields: [r.name.first, r.name.last],
				age: r.age,
			}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toContain("fields:");
		expect(result).toContain("[");
		expect(result).toContain("age:");
	});

	test("string modes still use RETURN without VALUE", () => {
		for (const mode of ["none", "before", "after", "diff"] as const) {
			const query = db
				.create("user")
				.set({ name: "Test", age: 1 })
				.return(mode);
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain(`RETURN ${mode.toUpperCase()}`);
			expect(result).not.toContain("RETURN VALUE");
		}
	});
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────

describe("UPDATE return projections", () => {
	test("RETURN VALUE <field> — single field", () => {
		const query = db
			.update("user", "alice")
			.set({ age: 31 })
			.return((r) => r.name);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPDATE");
		expect(result).toContain("RETURN VALUE");
		expect(result).toContain('$this["name"]');
	});

	test("RETURN VALUE { ... } — object", () => {
		const query = db
			.update("user", "alice")
			.set({ age: 31 })
			.return((r) => ({ name: r.name, age: r.age }));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toContain("{ name:");
		expect(result).toContain("age:");
	});

	test("RETURN VALUE [ ... ] — array", () => {
		const query = db
			.update("user", "alice")
			.set({ age: 31 })
			.return((r) => [r.name.first, r.age, r.email]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toContain("[");
		expect(result).toContain('$this["name"]["first"]');
		expect(result).toContain('$this["age"]');
		expect(result).toContain('$this["email"]');
		expect(result).toContain("]");
	});

	test("RETURN VALUE [ ... ] — array with nested object", () => {
		const query = db
			.update("user", "alice")
			.set({ age: 31 })
			.return((r) => [r.email, { name: r.name }]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toMatch(/\[.*,.*\{.*name:.*\}.*\]/);
	});

	test("string modes still use RETURN without VALUE", () => {
		for (const mode of ["none", "before", "after", "diff"] as const) {
			const query = db.update("user", "alice").set({ age: 31 }).return(mode);
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain(`RETURN ${mode.toUpperCase()}`);
			expect(result).not.toContain("RETURN VALUE");
		}
	});
});

// ─── UPSERT ──────────────────────────────────────────────────────────────────

describe("UPSERT return projections", () => {
	test("RETURN VALUE <field> — single field", () => {
		const query = db
			.upsert("user", "alice")
			.set({ name: "Alice", age: 30, email: "alice@example.com" })
			.return((r) => r.email);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("UPSERT");
		expect(result).toContain("RETURN VALUE");
		expect(result).toContain('$this["email"]');
	});

	test("RETURN VALUE { ... } — object", () => {
		const query = db
			.upsert("user", "alice")
			.set({ name: "Alice", age: 30, email: "alice@example.com" })
			.return((r) => ({ name: r.name, email: r.email }));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toContain("{ name:");
		expect(result).toContain("email:");
	});

	test("RETURN VALUE [ ... ] — array", () => {
		const query = db
			.upsert("user", "alice")
			.set({ name: "Alice", age: 30, email: "alice@example.com" })
			.return((r) => [r.name.first, r.age]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toContain("[");
		expect(result).toContain("]");
	});
});

// ─── INSERT ──────────────────────────────────────────────────────────────────

describe("INSERT return projections", () => {
	test("RETURN VALUE <field> — single field", () => {
		const query = db
			.insert("user", { name: "Test", age: 1, email: "t@t.com" })
			.return((r) => r.email);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("INSERT");
		expect(result).toContain("RETURN VALUE");
		expect(result).toContain('$this["email"]');
	});

	test("RETURN VALUE { ... } — object", () => {
		const query = db
			.insert("user", { name: "Test", age: 1, email: "t@t.com" })
			.return((r) => ({ name: r.name, age: r.age }));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toContain("{ name:");
		expect(result).toContain("age:");
	});

	test("RETURN VALUE [ ... ] — array", () => {
		const query = db
			.insert("user", { name: "Test", age: 1, email: "t@t.com" })
			.return((r) => [r.name, r.age]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toContain("[");
		expect(result).toContain("]");
	});
});

// ─── DELETE ──────────────────────────────────────────────────────────────────

describe("DELETE return projections", () => {
	test("RETURN VALUE <field> — single field", () => {
		const query = db.delete("user", "alice").return((r) => r.name);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("DELETE");
		expect(result).toContain("RETURN VALUE");
		expect(result).toContain('$this["name"]');
	});

	test("RETURN VALUE { ... } — object", () => {
		const query = db
			.delete("user", "alice")
			.return((r) => ({ name: r.name, age: r.age }));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toContain("{ name:");
		expect(result).toContain("age:");
	});

	test("RETURN VALUE [ ... ] — array", () => {
		const query = db.delete("user", "alice").return((r) => [r.name, r.age]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toContain("[");
		expect(result).toContain("]");
	});

	test("string modes still use RETURN without VALUE", () => {
		for (const mode of ["none", "before", "after", "diff"] as const) {
			const query = db.delete("user", "alice").return(mode);
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain(`RETURN ${mode.toUpperCase()}`);
			expect(result).not.toContain("RETURN VALUE");
		}
	});
});

// ─── RELATE ──────────────────────────────────────────────────────────────────

describe("RELATE return projections", () => {
	const from = new RecordId("user", "alice");
	const to = new RecordId("post", "post1");

	test("RETURN VALUE <field> — single field", () => {
		const query = db.relate("authored", from, to).return((r) => r.in);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RELATE");
		expect(result).toContain("RETURN VALUE");
	});

	test("RETURN VALUE { ... } — object", () => {
		const query = db
			.relate("authored", from, to)
			.return((r) => ({ from: r.in, to: r.out }));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toContain("{ from:");
		expect(result).toContain("to:");
	});

	test("RETURN VALUE [ ... ] — array", () => {
		const query = db.relate("authored", from, to).return((r) => [r.in, r.out]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toContain("[");
		expect(result).toContain("]");
	});

	test("RETURN VALUE [ ... ] — array with nested object", () => {
		const query = db
			.relate("authored", from, to)
			.return((r) => [r.in, { to: r.out, created: r.created }]);
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("RETURN VALUE");
		expect(result).toMatch(/\[.*,.*\{.*to:.*created:.*\}.*\]/);
	});

	test("string modes still use RETURN without VALUE", () => {
		for (const mode of ["none", "before", "after", "diff"] as const) {
			const query = db.relate("authored", from, to).return(mode);
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain(`RETURN ${mode.toUpperCase()}`);
			expect(result).not.toContain("RETURN VALUE");
		}
	});
});
