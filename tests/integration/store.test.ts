import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { createStore, orm, type QueryStore, t, table } from "../../src";
import { startProxy } from "../helpers/proxy";
import { withTestDb } from "./setup";

const task = table("task", {
	title: t.string(),
	done: t.bool(),
	priority: t.number(),
});

/** Poll until `check` passes, so a missing update fails the test instead of hanging. */
async function waitFor(check: () => boolean, ms = 10_000, label = "the store") {
	const deadline = Date.now() + ms;
	while (!check()) {
		if (Date.now() > deadline)
			throw new Error(`timed out waiting for ${label}`);
		await new Promise((r) => setTimeout(r, 25));
	}
}

const titles = <R extends { title: string }>(store: QueryStore<R>) => {
	const snap = store.getSnapshot();
	return snap.status === "success"
		? snap.data.map((r) => r.title).sort()
		: [snap.status];
};

describe("Store (integration)", () => {
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			await surreal.query("DEFINE TABLE task SCHEMALESS");
		},
	});

	function connect() {
		const { surreal } = getTestDb();
		const db = orm(surreal, task);
		return {
			surreal,
			db,
			store: createStore(db, { idleMs: 20, debounceMs: 10 }),
		};
	}

	test("loads the table and follows creates, updates and deletes", async () => {
		const { surreal, store, db } = connect();
		await db
			.create("task", "a")
			.content({ title: "A", done: false, priority: 1 });

		const all = store.query("task");
		const stop = all.subscribe(() => {});
		await waitFor(() => titles(all).join() === "A");

		await db
			.create("task", "b")
			.content({ title: "B", done: false, priority: 2 });
		await waitFor(() => titles(all).join() === "A,B");

		await db.update("task", "a").merge({ title: "A2" });
		await waitFor(() => titles(all).join() === "A2,B");

		await surreal.query("DELETE task:b");
		await waitFor(() => titles(all).join() === "A2");
		stop();
	});

	test("a filtered query drops a record that stops matching, and picks it up again", async () => {
		const { store, db } = connect();
		await db
			.create("task", "a")
			.content({ title: "A", done: false, priority: 1 });
		await db
			.create("task", "b")
			.content({ title: "B", done: false, priority: 2 });

		const open = store.query("task", (q) => q.where({ done: false }));
		const stop = open.subscribe(() => {});
		await waitFor(() => titles(open).join() === "A,B");

		// A live query with this filter would send nothing for this update.
		await db.update("task", "a").merge({ done: true });
		await waitFor(() => titles(open).join() === "B");

		await db.update("task", "a").merge({ done: false });
		await waitFor(() => titles(open).join() === "A,B");

		await db
			.create("task", "c")
			.content({ title: "C", done: true, priority: 3 });
		await db
			.create("task", "d")
			.content({ title: "D", done: false, priority: 4 });
		await waitFor(() => titles(open).join() === "A,B,D");
		stop();
	});

	test("an ordered, limited query follows the table", async () => {
		const { store, db } = connect();
		for (const [id, priority] of [
			["a", 1],
			["b", 2],
			["c", 3],
		] as const) {
			await db.create("task", id).content({ title: id, done: false, priority });
		}
		const top = store.query("task", (q) =>
			q.orderBy("priority", "DESC").limit(2),
		);
		const stop = top.subscribe(() => {});
		const order = () => {
			const snap = top.getSnapshot();
			return snap.status === "success"
				? snap.data.map((r) => r.title).join()
				: snap.status;
		};
		await waitFor(() => order() === "c,b");
		await db
			.create("task", "d")
			.content({ title: "d", done: false, priority: 9 });
		await waitFor(() => order() === "d,c");
		stop();
	});

	test("changes made while the store starts are not lost", async () => {
		const { store, db } = connect();
		const all = store.query("task");
		const stop = all.subscribe(() => {});
		// Writes race the registration of the live query and the first read.
		await Promise.all(
			Array.from({ length: 30 }, (_, i) =>
				db
					.create("task", `r${i}`)
					.content({ title: `r${i}`, done: false, priority: i }),
			),
		);
		await waitFor(() => {
			const snap = all.getSnapshot();
			return snap.status === "success" && snap.data.length === 30;
		});
		stop();
	});

	test("asking for the same query twice shares one store", () => {
		const { store } = connect();
		expect(store.query("task")).toBe(store.query("task"));
		expect(store.query("task", (q) => q.where({ done: false }))).toBe(
			store.query("task", (q) => q.where({ done: false })),
		);
		expect(store.query("task", (q) => q.where({ done: false }))).not.toBe(
			store.query("task", (q) => q.where({ done: true })),
		);
	});

	test("reads the table again after the connection drops and returns", async () => {
		const { surreal } = getTestDb();
		const proxy = startProxy(process.env.SURREAL_URL || "ws://localhost:8000");
		const flaky = new Surreal();
		try {
			await flaky.connect(proxy.url);
			await flaky.signin({ username: "root", password: "root" });
			await flaky.use({
				namespace: surreal.namespace,
				database: surreal.database,
			});
			const db = orm(flaky, task);
			const store = createStore(db, { idleMs: 20, debounceMs: 10 });

			await surreal.query(
				'CREATE task:a SET title = "A", done = false, priority = 1',
			);
			const all = store.query("task");
			const stop = all.subscribe(() => {});
			await waitFor(() => titles(all).join() === "A");

			proxy.sever();
			await waitFor(() => flaky.status !== "connected", 10_000, "the drop");
			// Written while the store's connection is down: it is never delivered.
			await surreal.query(
				'CREATE task:b SET title = "B", done = false, priority = 2',
			);
			await waitFor(
				() => flaky.status === "connected",
				20_000,
				"the reconnect",
			);

			await waitFor(() => titles(all).join() === "A,B", 15_000, "the re-read");
			const snap = all.getSnapshot();
			expect(snap.status === "success" && snap.stale).toBe(false);

			// And it carries on following changes afterwards.
			await surreal.query(
				'CREATE task:c SET title = "C", done = false, priority = 3',
			);
			await waitFor(
				() => titles(all).join() === "A,B,C",
				15_000,
				"a later change",
			);
			stop();
		} finally {
			await flaky.close();
			proxy.stop();
		}
	});
});
