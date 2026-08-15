import { describe, expect, test } from "bun:test";
import type { SurrealSession } from "surrealdb";
import { t, table } from "../../../src";
import {
	type AppliedMigration,
	applied,
	checksum,
	migrate,
	plan,
	rollback,
} from "../../../src/migrator/migrate";

/**
 * Applying, recording and reversing a migration.
 *
 * `migrate` takes a session rather than reaching for one, so these run against
 * a stub that records what it was asked to do. No module mocking is involved —
 * the seam is the argument.
 */

/** A recorded call to `query`. */
interface Call {
	sql: string;
	bindings?: Record<string, unknown>;
}

/** A session that records its queries and replies from a scripted table. */
function session(replies: Record<string, unknown> = {}) {
	const calls: Call[] = [];

	const surreal = {
		query: async (sql: string, bindings?: Record<string, unknown>) => {
			calls.push({ sql, bindings });

			for (const [match, reply] of Object.entries(replies)) {
				if (sql.includes(match)) return reply;
			}

			// INFO FOR DB and INFO FOR TABLE both come back as a single result
			return [{}];
		},
	} as unknown as SurrealSession;

	return { surreal, calls, sql: () => calls.map((c) => c.sql) };
}

/** A migrations table holding `history`. */
function withHistory(history: AppliedMigration[]) {
	return session({ "SELECT * FROM": [history] });
}

/** One recorded migration, with a valid checksum unless told otherwise. */
function migration(
	overrides: Partial<AppliedMigration> = {},
): AppliedMigration {
	const up = overrides.up ?? ["DEFINE TABLE a TYPE NORMAL SCHEMAFULL;"];

	return {
		id: "surqlize_migrations:one",
		appliedAt: "2026-01-01T00:00:00.000Z",
		up,
		down: ["REMOVE TABLE a;"],
		checksum: checksum(up),
		...overrides,
	};
}

const user = table("user", { name: t.string() });

describe("plan", () => {
	test("reports the statements without running any of them", async () => {
		const { surreal, sql } = session();
		const pending = await plan(surreal, [user]);

		expect(pending.hasChanges).toBe(true);
		expect(pending.up.some((s) => s.startsWith("DEFINE TABLE user"))).toBe(
			true,
		);
		expect(sql().some((s) => s.startsWith("DEFINE TABLE user"))).toBe(false);
	});

	test("reports no changes when the database already matches", async () => {
		const { surreal } = session({
			"INFO FOR DB": [
				{ tables: { user: "DEFINE TABLE user TYPE NORMAL SCHEMAFULL" } },
			],
			"INFO FOR TABLE": [
				{
					fields: {
						name: "DEFINE FIELD name ON user TYPE string PERMISSIONS FULL",
					},
					indexes: {},
					events: {},
				},
			],
		});

		const pending = await plan(surreal, [user]);

		expect(pending.hasChanges).toBe(false);
		expect(pending.up).toEqual([]);
	});
});

describe("migrate", () => {
	test("creates the history table before applying anything", async () => {
		const { surreal, sql } = session();
		await migrate(surreal, [user]);

		const ensure = sql().findIndex((s) => s.includes("IF NOT EXISTS"));
		const apply = sql().findIndex((s) => s.startsWith("DEFINE TABLE user"));

		expect(ensure).toBeGreaterThanOrEqual(0);
		expect(ensure).toBeLessThan(apply);
	});

	test("applies every statement in one query", async () => {
		// One query so SurrealDB applies them together
		const { surreal, sql } = session();
		const pending = await plan(surreal, [user]);

		await migrate(surreal, [user]);

		expect(sql()).toContain(pending.up.join("\n"));
	});

	test("records what it ran, with a checksum over the up statements", async () => {
		const { surreal, calls } = session();
		await migrate(surreal, [user]);

		const recorded = calls.find((c) => c.sql.startsWith("CREATE"));
		const written = recorded?.bindings?.migration as AppliedMigration;

		expect(written.up.length).toBeGreaterThan(0);
		expect(written.down.length).toBeGreaterThan(0);
		expect(written.checksum).toBe(checksum(written.up));
		expect(written.appliedAt).toBeString();
	});

	test("does nothing and records nothing when there is nothing to do", async () => {
		const { surreal, sql } = session({
			"INFO FOR DB": [
				{ tables: { user: "DEFINE TABLE user TYPE NORMAL SCHEMAFULL" } },
			],
			"INFO FOR TABLE": [
				{
					fields: {
						name: "DEFINE FIELD name ON user TYPE string PERMISSIONS FULL",
					},
					indexes: {},
					events: {},
				},
			],
		});

		expect(await migrate(surreal, [user])).toBeNull();
		expect(sql().some((s) => s.startsWith("CREATE"))).toBe(false);
	});
});

describe("rollback", () => {
	test("runs the down statements of the most recent migration", async () => {
		const older = migration({ id: "m:1", down: ["REMOVE TABLE older;"] });
		const newer = migration({ id: "m:2", down: ["REMOVE TABLE newer;"] });
		const { surreal, sql } = withHistory([older, newer]);

		const undone = await rollback(surreal);

		expect(undone?.id).toBe("m:2");
		expect(sql()).toContain("REMOVE TABLE newer;");
		expect(sql()).not.toContain("REMOVE TABLE older;");
	});

	test("deletes the record it reversed", async () => {
		const { surreal, calls } = withHistory([migration({ id: "m:1" })]);
		await rollback(surreal);

		const deletion = calls.find((c) => c.sql.startsWith("DELETE"));

		expect(deletion?.bindings).toEqual({ id: "m:1" });
	});

	test("returns null when there is no history", async () => {
		const { surreal, sql } = withHistory([]);

		expect(await rollback(surreal)).toBeNull();
		expect(sql().some((s) => s.startsWith("DELETE"))).toBe(false);
	});

	test("refuses a migration whose record has been edited", async () => {
		// An edited `up` means the recorded `down` no longer undoes it
		const tampered = migration({ checksum: "deadbeef" });
		const { surreal } = withHistory([tampered]);

		await expect(rollback(surreal)).rejects.toThrow(
			/modified since it was applied/,
		);
	});

	test("reverses nothing when the check fails", async () => {
		const { surreal, sql } = withHistory([migration({ checksum: "deadbeef" })]);

		await rollback(surreal).catch(() => null);

		expect(sql().some((s) => s.startsWith("REMOVE"))).toBe(false);
		expect(sql().some((s) => s.startsWith("DELETE"))).toBe(false);
	});

	test("still clears the record when a migration had nothing to undo", async () => {
		const { surreal, calls } = withHistory([migration({ down: [] })]);

		await rollback(surreal);

		expect(calls.some((c) => c.sql.startsWith("DELETE"))).toBe(true);
	});
});

describe("applied", () => {
	test("returns the history oldest first", async () => {
		const { surreal, sql } = withHistory([migration({ id: "m:1" })]);

		expect(await applied(surreal)).toHaveLength(1);
		expect(sql().some((s) => s.includes("ORDER BY appliedAt ASC"))).toBe(true);
	});

	test("returns nothing rather than failing on a fresh database", async () => {
		const { surreal } = session({ "SELECT * FROM": [undefined] });

		expect(await applied(surreal)).toEqual([]);
	});
});

describe("checksum", () => {
	test("is stable for the same statements", () => {
		expect(checksum(["A;", "B;"])).toBe(checksum(["A;", "B;"]));
	});

	test("changes when a statement changes", () => {
		expect(checksum(["A;"])).not.toBe(checksum(["A2;"]));
	});

	test("depends on the order the statements ran in", () => {
		expect(checksum(["A;", "B;"])).not.toBe(checksum(["B;", "A;"]));
	});

	test("is a fixed-width hex digest", () => {
		expect(checksum(["A;"])).toMatch(/^[0-9a-f]{8}$/);
	});

	test("needs no crypto import, so it works in a browser", () => {
		expect(checksum([])).toMatch(/^[0-9a-f]{8}$/);
	});
});
