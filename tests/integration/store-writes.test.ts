import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import {
	createStore,
	memoryStorage,
	orm,
	type QueryStore,
	t,
	table,
} from "../../src";
import { encode } from "../../src/store/codec";
import { startProxy } from "../helpers/proxy";
import { withTestDb } from "./setup";

const task = table("task", {
	title: t.string(),
	done: t.bool(),
	priority: t.number(),
});

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
		? snap.data
				.map((r) => r.title)
				.sort()
				.join()
		: snap.status;
};

describe("Store writes (integration)", () => {
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			await surreal.query("DEFINE TABLE task SCHEMALESS");
			await surreal.query("DEFINE FIELD priority ON task TYPE number");
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

	test("a create shows at once and the database then confirms it, without a flicker", async () => {
		const { surreal, store } = connect();
		const all = store.query("task");
		const seen: string[] = [];
		const stop = all.subscribe(() => seen.push(titles(all)));
		await waitFor(() => titles(all) === "");

		const { id, committed } = store
			.table("task")
			.create({ title: "A", done: false, priority: 1 });
		// Visible before the database has been asked.
		expect(titles(all)).toBe("A");
		expect(id).toBeInstanceOf(RecordId);

		const row = await committed;
		expect(row?.title).toBe("A");
		expect(store.pending.getSnapshot()).toHaveLength(0);

		// The live notification for our own write arrives later and changes nothing.
		await new Promise((r) => setTimeout(r, 200));
		expect(titles(all)).toBe("A");
		const firstWithA = seen.indexOf("A");
		expect(firstWithA).toBeGreaterThan(-1);
		expect(seen.slice(firstWithA).every((s) => s === "A")).toBe(true);

		const [stored] =
			await surreal.query<[{ title: string }[]]>("SELECT * FROM task");
		expect(stored?.map((r) => r.title)).toEqual(["A"]);
		stop();
	});

	test("an update and a delete show at once and settle on what the database holds", async () => {
		const { surreal, store } = connect();
		const writes = store.table("task");
		const all = store.query("task");
		const stop = all.subscribe(() => {});
		const a = writes.create({ title: "A", done: false, priority: 1 });
		const b = writes.create({ title: "B", done: false, priority: 2 });
		await Promise.all([a.committed, b.committed]);
		await waitFor(() => titles(all) === "A,B");

		const rename = writes.update(a.id, { title: "A2" });
		expect(titles(all)).toBe("A2,B");
		writes.delete(b.id);
		expect(titles(all)).toBe("A2");
		await rename.committed;
		await waitFor(() => store.pending.getSnapshot().length === 0);
		await new Promise((r) => setTimeout(r, 150));
		expect(titles(all)).toBe("A2");

		const stored =
			await surreal.query<[{ title: string; priority: number }[]]>(
				"SELECT * FROM task",
			);
		expect(stored[0]).toHaveLength(1);
		expect(stored[0]?.[0]).toMatchObject({ title: "A2", priority: 1 });
		stop();
	});

	test("a write the database refuses is taken back, and its error reaches the caller", async () => {
		const { store } = connect();
		const all = store.query("task");
		const stop = all.subscribe(() => {});
		await waitFor(() => titles(all) === "");

		// `priority` must be a number, which the types would have caught.
		const bad = store
			.table("task")
			.create({ title: "Bad", done: false, priority: "x" as never });
		expect(titles(all)).toBe("Bad");
		await expect(bad.committed).rejects.toBeDefined();
		expect(titles(all)).toBe("");
		expect(store.pending.getSnapshot()).toHaveLength(0);

		// The next write is unaffected.
		await store
			.table("task")
			.create({ title: "Good", done: false, priority: 1 }).committed;
		await waitFor(() => titles(all) === "Good");
		stop();
	});

	test("a filtered query leaves a created record out until the database has it", async () => {
		const { store } = connect();
		const open = store.query("task", (q) => q.where({ done: false }));
		const stop = open.subscribe(() => {});
		await waitFor(() => titles(open) === "");
		const write = store
			.table("task")
			.create({ title: "New", done: false, priority: 1 });
		expect(titles(open)).toBe("");
		await write.committed;
		await waitFor(() => titles(open) === "New");
		stop();
	});

	test("writes made while disconnected show at once and reach the database on reconnect", async () => {
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
			const store = createStore(orm(flaky, task), {
				idleMs: 20,
				debounceMs: 10,
				retry: { minMs: 50, maxMs: 200 },
			});

			const all = store.query("task");
			const stop = all.subscribe(() => {});
			await waitFor(() => titles(all) === "");

			proxy.sever();
			await waitFor(() => flaky.status !== "connected", 10_000, "the drop");

			const writes = store.table("task");
			const a = writes.create({ title: "Offline A", done: false, priority: 1 });
			const b = writes.create({ title: "Offline B", done: false, priority: 2 });
			writes.update(a.id, { title: "Offline A2" });
			expect(titles(all)).toBe("Offline A2,Offline B");
			expect(store.pending.getSnapshot().length).toBe(2);

			await waitFor(
				() => flaky.status === "connected",
				20_000,
				"the reconnect",
			);
			await Promise.all([a.committed, b.committed]);
			await waitFor(() => store.pending.getSnapshot().length === 0);

			const [stored] = await surreal.query<[{ title: string }[]]>(
				"SELECT * FROM task ORDER BY priority",
			);
			expect(stored?.map((r) => r.title)).toEqual(["Offline A2", "Offline B"]);
			await waitFor(() => titles(all) === "Offline A2,Offline B");
			stop();
		} finally {
			await flaky.close();
			proxy.stop();
		}
	});

	test("writes left behind by an earlier session are sent when a store starts", async () => {
		const { db, surreal } = connect();
		const storage = memoryStorage();
		await storage.put(
			1,
			encode({
				table: "task",
				id: "left",
				kind: "create",
				data: { title: "Left", done: false, priority: 1 },
			}),
		);
		const store = createStore(db, { storage });
		await store.ready;
		await waitFor(() => store.pending.getSnapshot().length === 0);
		const [stored] =
			await surreal.query<[{ title: string }[]]>("SELECT * FROM task");
		expect(stored?.map((r) => r.title)).toEqual(["Left"]);
		expect(await storage.load()).toHaveLength(0);
	});

	test("sending a write twice leaves the same record", async () => {
		const { db, surreal } = connect();
		// The first attempt reached the database, but its answer was lost.
		await surreal.query(
			'CREATE task:dup SET title = "Dup", done = false, priority = 1',
		);
		const storage = memoryStorage();
		await storage.put(
			1,
			encode({
				table: "task",
				id: "dup",
				kind: "create",
				data: { title: "Dup", done: false, priority: 1 },
			}),
		);
		const store = createStore(db, { storage });
		await store.ready;
		await waitFor(() => store.pending.getSnapshot().length === 0);
		const [stored] =
			await surreal.query<[{ title: string }[]]>("SELECT * FROM task");
		expect(stored).toHaveLength(1);
		expect(stored?.[0]?.title).toBe("Dup");
	});

	test("updating a record that does not exist is refused", async () => {
		const { store } = connect();
		const result = store.table("task").update("ghost", { title: "x" });
		await expect(result.committed).rejects.toThrow(/does not exist/);
	});

	test("deleting a record that does not exist is not an error", async () => {
		const { store } = connect();
		await expect(
			store.table("task").delete("ghost").committed,
		).resolves.toBeUndefined();
	});
});
