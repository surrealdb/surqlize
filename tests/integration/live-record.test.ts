import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import {
	type LiveMessage,
	type LiveSubscription,
	orm,
	t,
	table,
} from "../../src";
import { withTestDb } from "./setup";

/**
 * `db.live()` on a record id: SurrealDB rejects `LIVE SELECT ... FROM user:n1`
 * ("Cannot execute LIVE statement using value"), so a record subscription must
 * select the table and filter it by id.
 */
const user = table("user", {
	name: t.string(),
	age: t.number(),
});

/** Resolve with the next `count` notifications. */
function collect<T>(
	sub: LiveSubscription<T>,
	count: number,
): Promise<LiveMessage<T>[]> {
	return new Promise((resolve) => {
		const messages: LiveMessage<T>[] = [];
		const off = sub.subscribe((message) => {
			messages.push(message);
			if (messages.length >= count) {
				off();
				resolve(messages);
			}
		});
	});
}

/** Reject if `promise` does not settle in time, so a missing notification fails. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) =>
			setTimeout(() => reject(new Error("timed out")), ms),
		),
	]);
}

describe("live() on a record id", () => {
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			await surreal.query("DEFINE TABLE user SCHEMALESS;");
		},
	});

	test("live(recordId) is notified only about that record", async () => {
		const { surreal } = getTestDb();
		const client = orm(surreal, user);

		const sub = await client.live(new RecordId("user", "watched"));
		const received = collect(sub, 2);

		// A change to another record must not be delivered.
		await surreal.query(`CREATE user:other SET name = "o", age = 1`);
		await surreal.query(`CREATE user:watched SET name = "w", age = 2`);
		await surreal.query(`UPDATE user:watched SET age = 3`);

		const messages = await withTimeout(received, 10_000);
		expect(messages.map((m) => m.action)).toEqual(["CREATE", "UPDATE"]);
		for (const m of messages) {
			expect(m.action).not.toBe("KILLED");
			if (m.action !== "KILLED") expect(m.recordId.id).toBe("watched");
		}
		await sub.kill();
	}, 15_000);

	test("live(table, id) is notified only about that record", async () => {
		const { surreal } = getTestDb();
		const client = orm(surreal, user);

		const sub = await client.live("user", "watched");
		const received = collect(sub, 1);

		await surreal.query(`CREATE user:other SET name = "o", age = 1`);
		await surreal.query(`CREATE user:watched SET name = "w", age = 2`);

		const [message] = await withTimeout(received, 10_000);
		expect(message?.action).toBe("CREATE");
		if (message?.action !== "KILLED") {
			expect(message?.recordId.id).toBe("watched");
		}
		await sub.kill();
	}, 15_000);

	test("a where() on a record subject applies alongside the id", async () => {
		const { surreal } = getTestDb();
		const client = orm(surreal, user);

		const sub = await client
			.live("user", "watched")
			.where((u) => u.age.gte(10));
		const received = collect(sub, 1);

		// Watched record, but too young for the filter: not delivered.
		await surreal.query(`CREATE user:watched SET name = "w", age = 5`);
		// Passes the filter, so this is the first delivered notification.
		await surreal.query(`UPDATE user:watched SET age = 12`);

		const [message] = await withTimeout(received, 10_000);
		expect(message?.action).toBe("UPDATE");
		if (message?.action !== "KILLED") {
			expect(message?.recordId.id).toBe("watched");
		}
		await sub.kill();
	}, 15_000);
});
