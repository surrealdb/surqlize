import { describe, expect, test } from "bun:test";
import { t, table } from "../../src";
import {
	applied,
	checksum,
	migrate,
	plan,
	rollback,
} from "../../src/migrator/migrate";
import { access } from "../../src/schema/ddl/entities";
import { withTestDb } from "./setup";

describe("Applying and reversing migrations", () => {
	const db = withTestDb({ perTest: true });

	test("plan reports changes without making them", async () => {
		const user = table("user", { name: t.string() });

		const pending = await plan(db().surreal, [user]);
		expect(pending.hasChanges).toBe(true);

		// Nothing should have been applied
		const stillPending = await plan(db().surreal, [user]);
		expect(stillPending.up).toEqual(pending.up);
	});

	test("migrate applies the change and records it", async () => {
		const user = table("user", { name: t.string() });

		const applied1 = await migrate(db().surreal, [user]);
		expect(applied1).not.toBeNull();
		expect(applied1?.up.length).toBeGreaterThan(0);
		expect(applied1?.checksum).toBe(checksum(applied1?.up ?? []));

		const [info] = await db().surreal.query<[{ fields: object }]>(
			"INFO FOR TABLE user;",
		);
		expect(Object.keys(info.fields)).toContain("name");
	});

	test("migrate is a no-op once the database matches", async () => {
		const user = table("user", { name: t.string() });

		await migrate(db().surreal, [user]);
		expect(await migrate(db().surreal, [user])).toBeNull();

		// And only one migration was recorded
		expect(await applied(db().surreal)).toHaveLength(1);
	});

	test("history is returned oldest first", async () => {
		await migrate(db().surreal, [table("a", { x: t.string() })]);
		await migrate(db().surreal, [
			table("a", { x: t.string() }),
			table("b", { y: t.string() }),
		]);

		const history = await applied(db().surreal);
		expect(history).toHaveLength(2);
		expect(
			history[0]?.appliedAt.localeCompare(history[1]?.appliedAt ?? ""),
		).toBeLessThanOrEqual(0);
	});

	test("the migrations table is not mistaken for schema drift", async () => {
		const user = table("user", { name: t.string() });
		await migrate(db().surreal, [user]);

		// _migrations exists but is excluded from introspection, so a schema that
		// does not declare it must not try to drop it.
		const pending = await plan(db().surreal, [user], { removeMissing: true });
		expect(pending.up).toEqual([]);
	});

	test("rollback undoes the last migration", async () => {
		await migrate(db().surreal, [table("user", { name: t.string() })]);
		await migrate(db().surreal, [
			table("user", { name: t.string(), age: t.int() }),
		]);

		const undone = await rollback(db().surreal);
		expect(undone).not.toBeNull();

		const [info] = await db().surreal.query<[{ fields: object }]>(
			"INFO FOR TABLE user;",
		);
		expect(Object.keys(info.fields)).not.toContain("age");
		expect(await applied(db().surreal)).toHaveLength(1);
	});

	test("rollback returns null when there is no history", async () => {
		expect(await rollback(db().surreal)).toBeNull();
	});

	test("rollback refuses a migration whose record was edited", async () => {
		await migrate(db().surreal, [table("user", { name: t.string() })]);

		// Tamper with the recorded statements, leaving the checksum behind
		const history = await applied(db().surreal);
		await db().surreal.query(
			`UPDATE $id SET up = ["DEFINE TABLE tampered SCHEMAFULL;"];`,
			{ id: history[0]?.id },
		);

		expect(rollback(db().surreal)).rejects.toThrow(
			/modified since it was applied/,
		);
	});

	test("a rename round-trips through migrate and rollback", async () => {
		await migrate(db().surreal, [table("account", { username: t.string() })]);
		await db().surreal.query("CREATE account:1 SET username = 'alice';");

		await migrate(db().surreal, [
			table("account", { displayName: t.string().was("username") }),
		]);

		const [renamed] = await db().surreal.query<[{ displayName: string }[]]>(
			"SELECT displayName FROM account;",
		);
		expect(renamed[0]?.displayName).toBe("alice");

		await rollback(db().surreal);

		const [restored] = await db().surreal.query<[{ username: string }[]]>(
			"SELECT username FROM account;",
		);
		expect(restored[0]?.username).toBe("alice");
	});
});

describe("Access keys", () => {
	const db = withTestDb({ perTest: true });

	const KEY = "integration-signing-key-4471";
	const keyed = access("jw", { type: "JWT", key: KEY, issuerKey: KEY });
	// Declared so that the migrator manages accesses at all
	const bearer = access("grants", { type: "BEARER", for: "USER" });

	test("a key reaches the database and never the plan output or the history", async () => {
		const pending = await plan(db().surreal, [keyed]);
		expect(pending.up.join("\n")).toContain(KEY);
		expect(pending.display.join("\n")).not.toContain(KEY);

		const result = await migrate(db().surreal, [keyed]);
		expect(JSON.stringify(result)).not.toContain(KEY);

		// The key is in force, and the server does not give it back. It reports
		// '[REDACTED]' in its place, and the refusal to roll back a removal below
		// rests on that text, so it is asserted here on every server in the
		// matrix: a server that said something else would fail here, by name.
		const [info] =
			await db().surreal.query<[{ accesses: Record<string, string> }]>(
				"INFO FOR DB;",
			);
		expect(info.accesses.jw).toContain("DEFINE ACCESS jw");
		expect(info.accesses.jw).not.toContain(KEY);
		expect(info.accesses.jw).toContain("[REDACTED]");

		const [rows] = await db().surreal.query<[unknown[]]>(
			"SELECT * FROM _migrations;",
		);
		expect(JSON.stringify(rows)).not.toContain(KEY);

		// And a record of it that carries no key still rolls back
		await rollback(db().surreal);
		const [after] =
			await db().surreal.query<[{ accesses: Record<string, string> }]>(
				"INFO FOR DB;",
			);
		expect(after.accesses).toEqual({});
	});

	test("a rollback that would restore a removed access is refused, and changes nothing", async () => {
		await migrate(db().surreal, [keyed, bearer]);

		// Two migrations recorded in the same millisecond have no order in the
		// history, and the rollback below has to find the removal last
		await Bun.sleep(5);

		// What `--remove-missing` does to an access the schema stopped declaring
		await migrate(db().surreal, [bearer], { removeMissing: true });
		const [removed] =
			await db().surreal.query<[{ accesses: Record<string, string> }]>(
				"INFO FOR DB;",
			);
		expect(Object.keys(removed.accesses)).toEqual(["grants"]);

		const before = await applied(db().surreal);

		// The refusal itself, not a server error that happens to name the access
		await expect(rollback(db().surreal)).rejects.toThrow(
			/cannot be rolled back.*\bjw\b/,
		);

		// Nothing was replayed: the access is still gone, so no token can be
		// signed with the text the server shows in its place
		const [after] =
			await db().surreal.query<[{ accesses: Record<string, string> }]>(
				"INFO FOR DB;",
			);
		expect(Object.keys(after.accesses)).toEqual(["grants"]);
		expect(await applied(db().surreal)).toEqual(before);
	});

	test("a removal recorded before the keys were hidden is refused too", async () => {
		await migrate(db().surreal, [keyed, bearer]);

		// Rewrite the history as the older code wrote it for a removal: the stored
		// text, hidden keys and all, as the way back
		const [info] =
			await db().surreal.query<[{ accesses: Record<string, string> }]>(
				"INFO FOR DB;",
			);
		const up = ["REMOVE ACCESS jw ON DATABASE;"];
		await db().surreal.query("DELETE _migrations;");
		await db().surreal.query("CREATE _migrations CONTENT $row;", {
			row: {
				appliedAt: new Date().toISOString(),
				up,
				down: [`${info.accesses.jw};`],
				checksum: checksum(up),
			},
		});
		await db().surreal.query(up.join("\n"));

		await expect(rollback(db().surreal)).rejects.toThrow(
			/cannot be rolled back.*\bjw\b/,
		);

		const [after] =
			await db().surreal.query<[{ accesses: Record<string, string> }]>(
				"INFO FOR DB;",
			);
		expect(Object.keys(after.accesses)).toEqual(["grants"]);
	});
});

describe("checksum", () => {
	test("is stable for the same statements", () => {
		expect(checksum(["a", "b"])).toBe(checksum(["a", "b"]));
	});

	test("changes when the statements do", () => {
		expect(checksum(["a", "b"])).not.toBe(checksum(["a", "c"]));
	});
});
