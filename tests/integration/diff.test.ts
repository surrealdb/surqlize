import { describe, expect, test } from "bun:test";
import { edge, t, table } from "../../src";
import { diff } from "../../src/migrator/diff";
import { introspect } from "../../src/migrator/introspect";
import type { DefinableSchema } from "../../src/schema/ddl/define";
import { withTestDb } from "./setup";

describe("Diffing a schema against a database", () => {
	const db = withTestDb({ perTest: true });

	/** Diff, apply, and return the statements that were run. */
	async function migrate(schemas: DefinableSchema[]): Promise<string[]> {
		const current = await introspect(db().surreal);
		const { up } = diff(schemas, current);
		if (up.length) await db().surreal.query(up.join("\n"));
		return up;
	}

	/** Diff without applying, to see what a second run would do. */
	async function pending(schemas: DefinableSchema[]): Promise<string[]> {
		const current = await introspect(db().surreal);
		return diff(schemas, current).up;
	}

	test("creates a table that does not exist", async () => {
		const user = table("user", { name: t.string(), age: t.int() });

		const up = await migrate([user]);
		expect(up[0]).toContain("DEFINE TABLE user");
		expect(up.some((s) => s.includes("DEFINE FIELD name"))).toBe(true);
	});

	/**
	 * The property everything rests on: after applying, the schema and the
	 * database agree. Anything that fails here re-applies the same change on
	 * every run.
	 */
	test("converges — a second run has nothing to do", async () => {
		const user = table("user", {
			name: t.string().assert("string::len($value) > 2"),
			age: t.int().default(0),
			createdAt: t.date().defaultAlways("time::now()"),
			bio: t.option(t.string()),
			tags: t.array(t.string()),
			address: t.object({ street: t.string(), city: t.string() }),
			items: t.array(t.object({ sku: t.string() })),
			note: t.string().comment("A note"),
			meta: t.object({ x: t.string() }).flexible(),
		})
			.permissions({ select: "FULL" })
			.comment("People");

		await migrate([user]);
		expect(await pending([user])).toEqual([]);
	});

	test("converges for an edge too", async () => {
		const user = table("user", { name: t.string() });
		const post = table("post", { title: t.string() });
		const authored = edge("user", "authored", "post", {
			at: t.date().default("time::now()"),
		}).enforced();

		await migrate([user, post, authored]);
		expect(await pending([user, post, authored])).toEqual([]);
	});

	test("adds a field without touching the rest", async () => {
		const before = table("user", { name: t.string() });
		await migrate([before]);

		const after = table("user", { name: t.string(), age: t.int() });
		const up = await pending([after]);

		expect(up).toHaveLength(1);
		expect(up[0]).toContain("DEFINE FIELD age");
		expect(up[0]).not.toContain("OVERWRITE");
	});

	test("modifies a changed field with OVERWRITE", async () => {
		// A bare DEFINE errors with "already exists", so a change must overwrite.
		await migrate([table("user", { age: t.int() })]);

		const up = await pending([table("user", { age: t.int().default(0) })]);
		expect(up).toHaveLength(1);
		expect(up[0]).toContain("DEFINE FIELD OVERWRITE age");
		expect(up[0]).toContain("DEFAULT 0");
	});

	test("leaves undeclared fields alone by default", async () => {
		await migrate([table("user", { name: t.string(), age: t.int() })]);

		// A schema is usually a partial view; dropping what it omits loses data.
		expect(await pending([table("user", { name: t.string() })])).toEqual([]);
	});

	test("removes undeclared fields when asked", async () => {
		await migrate([table("user", { name: t.string(), age: t.int() })]);

		const current = await introspect(db().surreal);
		const { up } = diff([table("user", { name: t.string() })], current, {
			removeMissing: true,
		});

		expect(up).toEqual(["REMOVE FIELD age ON TABLE user;"]);
	});

	test("does not mistake an array's element field for drift", async () => {
		// SurrealDB creates `tags[*]` itself; it is not something the schema omitted.
		const user = table("user", { tags: t.array(t.string()) });
		await migrate([user]);

		const current = await introspect(db().surreal);
		const { up } = diff([user], current, { removeMissing: true });
		expect(up).toEqual([]);
	});

	test("renames a field, carrying the value across", async () => {
		await migrate([table("account", { username: t.string() })]);
		await db().surreal.query("CREATE account:1 SET username = 'alice';");

		const renamed = table("account", {
			displayName: t.string().was("username"),
		});

		const up = await pending([renamed]);
		expect(up).toEqual([
			"DEFINE FIELD displayName ON TABLE account TYPE string;",
			"UPDATE account SET displayName = username;",
			"REMOVE FIELD username ON TABLE account;",
			"UPDATE account UNSET username;",
		]);

		await migrate([renamed]);

		const [rows] = await db().surreal.query<[{ displayName: string }[]]>(
			"SELECT displayName FROM account;",
		);
		expect(rows[0]?.displayName).toBe("alice");
	});

	test("a rename is idempotent once applied", async () => {
		await migrate([table("account", { username: t.string() })]);

		const renamed = table("account", {
			displayName: t.string().was("username"),
		});
		await migrate([renamed]);

		// The old name is gone and the new one is present, so there is no rename
		// left to make — the `.was()` can stay in the schema indefinitely.
		expect(await pending([renamed])).toEqual([]);
	});

	test("treats a rename as a change, not a drop and a create", async () => {
		await migrate([table("account", { username: t.string() })]);

		const up = await pending([
			table("account", { displayName: t.string().was("username") }),
		]);

		expect(up.some((s) => s.startsWith("REMOVE FIELD username"))).toBe(true);
		expect(up.some((s) => s.includes("UPDATE account SET displayName"))).toBe(
			true,
		);
	});

	test("produces a rollback that restores the previous state", async () => {
		await migrate([table("user", { name: t.string() })]);

		const current = await introspect(db().surreal);
		const { down } = diff(
			[table("user", { name: t.string(), age: t.int() })],
			current,
		);

		expect(down).toEqual(["REMOVE FIELD age ON TABLE user;"]);
	});
});
