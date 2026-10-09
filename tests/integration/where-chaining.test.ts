import { describe, expect, test } from "bun:test";
import type { LiveMessage, LiveSubscription } from "../../src";
import { seedTestData } from "../helpers/db";
import { withTestDb } from "./setup";

/**
 * Seeded users: alice (30), bob (25), charlie (35). Chained `.where()` calls AND
 * together, so each test narrows the rows the previous calls kept.
 */

/** Resolve with the next `count` notifications for `action`, or reject on timeout. */
function collect<T>(
	sub: LiveSubscription<T>,
	count: number,
	action: LiveMessage<T>["action"],
	ms = 10_000,
): Promise<LiveMessage<T>[]> {
	return new Promise((resolve, reject) => {
		const messages: LiveMessage<T>[] = [];
		const timer = setTimeout(
			() => reject(new Error(`timed out waiting for ${action}`)),
			ms,
		);
		const off = sub.subscribe((message) => {
			if (message.action !== action) return;
			messages.push(message);
			if (messages.length >= count) {
				clearTimeout(timer);
				off();
				resolve(messages);
			}
		});
	});
}

describe("chained where() against SurrealDB", () => {
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			await seedTestData(surreal);
		},
	});

	describe("select", () => {
		test("chained callbacks intersect", async () => {
			const { db } = getTestDb();
			const rows = await db
				.select("user")
				.where((u) => u.age.gt(26))
				.where((u) => u.age.lt(33))
				.execute();
			expect(rows.map((u) => u.email)).toEqual(["alice@example.com"]);
		});

		test("an object filter and a callback intersect", async () => {
			const { db } = getTestDb();
			const rows = await db
				.select("user")
				.where({ age: { gte: 26 } })
				.where((u) => u.name.first.eq("Charlie"))
				.execute();
			expect(rows.map((u) => u.email)).toEqual(["charlie@example.com"]);
		});

		test("where({}) keeps the earlier filter", async () => {
			const { db } = getTestDb();
			const rows = await db
				.select("user")
				.where((u) => u.age.gt(26))
				.where({})
				.execute();
			expect(rows.map((u) => u.email).sort()).toEqual([
				"alice@example.com",
				"charlie@example.com",
			]);
		});

		test("clearWhere() drops every condition", async () => {
			const { db } = getTestDb();
			const rows = await db
				.select("user")
				.where((u) => u.age.gt(100))
				.clearWhere()
				.execute();
			expect(rows.length).toBe(3);
		});
	});

	describe("update", () => {
		test("changes only the rows matching every chained where", async () => {
			const { db, surreal } = getTestDb();
			await db
				.update("user")
				.set({ email: "changed@example.com" })
				.where((u) => u.age.gt(26))
				.where((u) => u.age.lt(33))
				.execute();

			const [rows] = await surreal.query<[{ email: string }[]]>(
				"SELECT email FROM user ORDER BY email",
			);
			expect(rows?.map((r) => r.email)).toEqual([
				"bob@example.com",
				"changed@example.com",
				"charlie@example.com",
			]);
		});
	});

	describe("delete", () => {
		test("removes only the rows matching every chained where", async () => {
			const { db, surreal } = getTestDb();
			await db
				.delete("user")
				.where((u) => u.age.gt(26))
				.where((u) => u.age.lt(33))
				.execute();

			const [rows] = await surreal.query<[{ email: string }[]]>(
				"SELECT email FROM user ORDER BY email",
			);
			expect(rows?.map((r) => r.email)).toEqual([
				"bob@example.com",
				"charlie@example.com",
			]);
		});
	});

	describe("live", () => {
		test("notifies only for records matching every chained where", async () => {
			const { db } = getTestDb();
			const sub = await db
				.live("user")
				.where((u) => u.age.gt(26))
				.where((u) => u.age.lt(33));
			const received = collect(sub, 1, "CREATE");

			// Too old fails the second condition; too young fails the first.
			for (const [id, age] of [
				["old", 40],
				["young", 20],
				["match", 28],
			] as const) {
				await db
					.create("user", id)
					.set({
						name: { first: id, last: "Test" },
						age,
						email: `${id}@example.com`,
						created: new Date(),
						updated: new Date(),
					})
					.execute();
			}

			// The first CREATE delivered must be the in-range record, not "old" or "young".
			const [message] = await received;
			expect(message?.action).toBe("CREATE");
			expect(
				message && "recordId" in message ? message.recordId?.id : undefined,
			).toBe("match");
			await sub.kill();
		}, 15_000);
	});
});
