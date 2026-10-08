import { describe, expect, test } from "bun:test";
import { NotFoundError, RecordId, Surreal } from "surrealdb";
import {
	type LiveMessage,
	type LiveSubscription,
	orm,
	t,
	table,
} from "../../src";
import { startProxy } from "../helpers/proxy";
import { withTestDb } from "./setup";

/**
 * Narrow a notification to a record change.
 *
 * `LiveMessage` is a union: a `KILLED` notification carries neither a record nor
 * a value. Tests about record changes assert that once, here, instead of
 * scattering non-null assertions over every field access.
 */
function change<T>(message: LiveMessage<T> | undefined) {
	expect(message).toBeDefined();
	expect(message?.action).not.toBe("KILLED");
	return message as Extract<
		LiveMessage<T>,
		{ action: "CREATE" | "UPDATE" | "DELETE" }
	>;
}

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

const userData = (first: string) => ({
	name: { first, last: "Test" },
	age: 30,
	email: `${first.toLowerCase()}@example.com`,
	created: new Date(),
	updated: new Date(),
});

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
		expect(change(messages[0]).value.name.first).toBe("John");
		expect(change(messages[0]).value.age).toBe(30);
		expect(change(messages[1]).value.age).toBe(31);
		expect(change(messages[0]).recordId.id).toBe("live_user");

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

		expect(change(message).value.age).toBe(30);
		expect(change(message).recordId.id).toBe("adult");

		await sub.kill();
	}, 15_000);

	test("delivers a final KILLED notification, with no record, when the table is removed", async () => {
		const { db, surreal } = getTestDb();

		const sub = await db.live("user");
		expect(sub.isAlive).toBe(true);

		const killed = collect(sub, 1, "KILLED");
		await surreal.query("REMOVE TABLE user");

		const [message] = await withTimeout(killed, 10_000, "KILLED notification");

		expect(message?.action).toBe("KILLED");
		// The union narrows: a KILLED message has neither a record id nor a value.
		expect(message?.recordId).toBeUndefined();
		expect(message?.value).toBeUndefined();
		expect(sub.isAlive).toBe(false);
	}, 15_000);

	test("isAlive turns false once the subscription is killed", async () => {
		const { db } = getTestDb();

		const sub = await db.live("user");
		expect(sub.isAlive).toBe(true);

		await sub.kill();
		expect(sub.isAlive).toBe(false);
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

	describe("registration failures", () => {
		test("a table that does not exist rejects with the server's NotFoundError", async () => {
			const { db } = getTestDb();

			// `post` and `user` are defined by setup; this one is not.
			const error = await db
				.live("authored" as never)
				.execute()
				.then(
					() => undefined,
					(e: unknown) => e,
				);

			expect(error).toBeInstanceOf(NotFoundError);
			expect((error as Error).message).toMatch(/does not exist/);
		}, 15_000);
	});

	describe("managed subscriptions", () => {
		test("a table, with WHERE, FETCH and DIFF, is managed by the SDK", async () => {
			const { db } = getTestDb();

			const subs = [
				await db.live("user"),
				await db.live("user").where((u) => u.age.gte(18)),
				await db.live("post").fetch("author"),
				await db.live("user").diff(),
				await db
					.live("post")
					.where((p) => p.title.contains("a"))
					.fetch("author")
					.diff(),
			];

			expect(subs.map((sub) => sub.isManaged)).toEqual(subs.map(() => true));
			await Promise.all(subs.map((sub) => sub.kill()));
		}, 15_000);

		test("escapes FETCH paths, including nested ones, on the managed path", async () => {
			const { surreal } = getTestDb();
			// Names that are not valid bare identifiers must reach the SDK escaped.
			const account = table("user", { name: t.string() });
			const article = table("post", {
				"co-author": t.record("user"),
				meta: t.object({ "lead author": t.record("user") }),
			});
			const db = orm(surreal, account, article);
			await surreal.query('CREATE user:ada SET name = "Ada"');

			const top = await db.live("post").fetch("co-author");
			const nested = await db.live("post").fetch("meta.lead author");
			const topSeen = collect(top, 1, "CREATE");
			const nestedSeen = collect(nested, 1, "CREATE");
			await surreal.query(
				'CREATE post:p SET `co-author` = user:ada, meta = { "lead author": user:ada }',
			);

			const [topMessage] = await withTimeout(topSeen, 10_000);
			const [nestedMessage] = await withTimeout(nestedSeen, 10_000);
			expect(top.isManaged).toBe(true);
			expect(nested.isManaged).toBe(true);
			expect(change(topMessage).value["co-author"].name).toBe("Ada");
			expect(change(nestedMessage).value.meta["lead author"].name).toBe("Ada");

			await top.kill();
			await nested.kill();
		}, 15_000);

		test("a .return() projection cannot be managed", async () => {
			const { db } = getTestDb();

			const sub = await db.live("user").return((u) => ({ name: u.name }));

			expect(sub.isManaged).toBe(false);
			expect(sub.isAlive).toBe(true);
			await sub.kill();
		}, 15_000);

		test("filters, fetches and diffs through the managed path", async () => {
			const { db } = getTestDb();
			await db.create("user", "author").set(userData("Author"));

			const fetched = await db.live("post").fetch("author");
			const diffs = await db
				.live("user")
				.where((u) => u.age.gte(40))
				.diff();
			const gotPost = collect(fetched, 1, "CREATE");
			const gotDiff = collect(diffs, 1, "CREATE");

			await db.create("post", "p1").set({
				title: "Hello",
				body: "World",
				author: new RecordId("user", "author"),
				created: new Date(),
				updated: new Date(),
			});
			await db.create("user", "young").set({ ...userData("Young"), age: 20 });
			await db.create("user", "old").set({ ...userData("Old"), age: 50 });

			// FETCH resolved the link: the author is a record, not a RecordId.
			const [post] = await withTimeout(gotPost, 10_000);
			expect(change(post).value.author.name.first).toBe("Author");
			// The filter dropped the younger user; the diff is a JSON Patch.
			const [diff] = await withTimeout(gotDiff, 10_000);
			expect(change(diff).recordId.id).toBe("old");
			expect(Array.isArray(change(diff).value)).toBe(true);

			await fetched.kill();
			await diffs.kill();
		}, 15_000);
	});

	describe("reconnecting", () => {
		/** A schema for a client that talks to the server through a proxy. */
		const account = table("user", { name: t.string(), age: t.number() });

		/** Wait for `predicate`, polling every 25ms. */
		async function waitFor(predicate: () => boolean, ms: number, what: string) {
			const deadline = performance.now() + ms;
			while (!predicate()) {
				if (performance.now() > deadline) throw new Error(`timed out: ${what}`);
				await Bun.sleep(25);
			}
		}

		test("a managed subscription keeps delivering after the connection drops and returns", async () => {
			const { surreal } = getTestDb();
			const proxy = startProxy(
				process.env.SURREAL_URL || "ws://localhost:8000",
			);
			const flaky = new Surreal();

			try {
				await flaky.connect(proxy.url);
				await flaky.signin({ username: "root", password: "root" });
				await flaky.use({
					namespace: surreal.namespace,
					database: surreal.database,
				});
				const db = orm(flaky, account);

				const sub = await db.live("user").where((u) => u.age.gte(18));
				expect(sub.isManaged).toBe(true);
				const idBefore = sub.id.toString();
				const received: string[] = [];
				sub.subscribe((message) => {
					if (message.action !== "KILLED")
						received.push(String(message.recordId.id));
				});

				// Sanity check: it works before the drop.
				await surreal.query('CREATE user:before SET name = "b", age = 30');
				await waitFor(
					() => received.includes("before"),
					10_000,
					"first record",
				);

				proxy.sever();
				await waitFor(
					() => flaky.status !== "connected",
					10_000,
					"to notice the drop",
				);
				await waitFor(
					() => flaky.status === "connected",
					20_000,
					"to reconnect",
				);

				// Registering again is asynchronous, so keep writing until it is up.
				// (An SDK query is lazy: it is only sent once it is awaited.)
				const deadline = performance.now() + 20_000;
				for (let n = 0; !received.some((id) => id.startsWith("after_")); n++) {
					if (performance.now() > deadline) {
						throw new Error("timed out: a notification after reconnecting");
					}
					await surreal.query(
						`CREATE user:after_${n} SET name = "a", age = 40`,
					);
					await Bun.sleep(100);
				}

				expect(sub.isAlive).toBe(true);
				// The SDK registered a new live query to replace the one that was lost.
				expect(sub.id.toString()).not.toBe(idBefore);
				await sub.kill();
			} finally {
				await flaky.close();
				proxy.stop();
			}
		}, 60_000);
	});
});
