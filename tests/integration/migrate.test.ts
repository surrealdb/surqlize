import { describe, expect, test } from "bun:test";
import { t, table } from "../../src";
import {
	applied,
	checksum,
	migrate,
	plan,
	rollback,
} from "../../src/migrator/migrate";
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

describe("checksum", () => {
	test("is stable for the same statements", () => {
		expect(checksum(["a", "b"])).toBe(checksum(["a", "b"]));
	});

	test("changes when the statements do", () => {
		expect(checksum(["a", "b"])).not.toBe(checksum(["a", "c"]));
	});
});
