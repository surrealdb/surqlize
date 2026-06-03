import { describe, expect, test } from "bun:test";
import type { LiveMessage, LiveSubscription } from "../../src";
import { withTestDb } from "./setup";

/** Reject if `promise` does not settle within `ms`, so a missing live
 * notification fails the test instead of hanging. */
function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	label = "live notification",
): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) =>
			setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), ms),
		),
	]);
}

/** Resolve with the next `count` notifications (optionally filtered by action). */
function collect<T>(
	sub: LiveSubscription<T>,
	count: number,
	action?: LiveMessage<T>["action"],
): Promise<LiveMessage<T>[]> {
	return new Promise((resolve) => {
		const messages: LiveMessage<T>[] = [];
		const off = sub.subscribe((message) => {
			if (action && message.action !== action) return;
			messages.push(message);
			if (messages.length >= count) {
				off();
				resolve(messages);
			}
		});
	});
}

describe("Live query integration tests", () => {
	// SurrealDB rejects `LIVE SELECT` against a table that does not exist, and
	// these tests subscribe before any record is created — so define the tables
	// up front (as a real app would).
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			await surreal.query(
				"DEFINE TABLE user SCHEMALESS; DEFINE TABLE post SCHEMALESS;",
			);
		},
	});

	test("delivers CREATE / UPDATE / DELETE notifications with parsed values", async () => {
		const { db } = getTestDb();

		const sub = await db.live("user");
		// Subscribe before mutating so no notifications are missed.
		const received = collect(sub, 3);

		await db
			.create("user", "live_user")
			.set({
				name: { first: "John", last: "Doe" },
				age: 30,
				email: "john@example.com",
				created: new Date(),
				updated: new Date(),
			})
			.execute();
		await db.update("user", "live_user").merge({ age: 31 }).execute();
		await db.delete("user", "live_user").execute();

		const messages = await withTimeout(received, 10_000);

		expect(messages.map((m) => m.action)).toEqual([
			"CREATE",
			"UPDATE",
			"DELETE",
		]);
		// Value is parsed against the schema (nested object survives).
		expect(messages[0]!.value.name.first).toBe("John");
		expect(messages[0]!.value.age).toBe(30);
		expect(messages[1]!.value.age).toBe(31);
		expect(messages[0]!.recordId.id).toBe("live_user");

		await sub.kill();
	}, 15_000);

	test("filters notifications with WHERE (requires SurrealDB >= 3.0)", async () => {
		const { db } = getTestDb();

		const sub = await db.live("user").where(($this) => $this.age.gte(18));
		const received = collect(sub, 1, "CREATE");

		// Under-18 is filtered out; the adult is the first delivered CREATE.
		await db
			.create("user", "minor")
			.set({
				name: { first: "Kid", last: "Young" },
				age: 10,
				email: "kid@example.com",
				created: new Date(),
				updated: new Date(),
			})
			.execute();
		await db
			.create("user", "adult")
			.set({
				name: { first: "Grown", last: "Up" },
				age: 30,
				email: "grown@example.com",
				created: new Date(),
				updated: new Date(),
			})
			.execute();

		const [message] = await withTimeout(received, 10_000);

		expect(message!.value.age).toBe(30);
		expect(message!.recordId.id).toBe("adult");

		await sub.kill();
	}, 15_000);

	test("the .subscribe() shortcut starts the query and returns a stop function", async () => {
		const { db } = getTestDb();

		let resolveFirst: (message: LiveMessage<unknown>) => void;
		const first = new Promise<LiveMessage<unknown>>((resolve) => {
			resolveFirst = resolve;
		});

		const stop = await db.live("user").subscribe((message) => {
			resolveFirst(message);
		});

		await db
			.create("user")
			.set({
				name: { first: "Eve", last: "Stone" },
				age: 42,
				email: "eve@example.com",
				created: new Date(),
				updated: new Date(),
			})
			.execute();

		const message = await withTimeout(first, 10_000);
		expect(message.action).toBe("CREATE");

		stop();
	}, 15_000);
});
