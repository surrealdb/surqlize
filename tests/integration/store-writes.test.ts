import { describe, expect, spyOn, test } from "bun:test";
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
import { atLeast, serverVersion } from "../helpers/db";
import { startProxy } from "../helpers/proxy";
import { withTestDb } from "./setup";

// SurrealDB 3.1.0 started reporting a transaction conflict as a structured
// error, which is what the store recognises as retryable. Earlier servers keep
// the behaviour of a refusal until the text they send has been checked.
const structuredConflicts = atLeast(await serverVersion(), 3, 1);

const task = table("task", {
	title: t.string(),
	done: t.bool(),
	priority: t.number(),
});

const note = table("note", {
	title: t.string(),
	body: t.option(t.string()),
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
			await surreal.query("DEFINE TABLE note SCHEMALESS");
		},
	});

	function connect() {
		const { surreal } = getTestDb();
		const db = orm(surreal, task, note);
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

	test("a filtered query shows a created record at once when it matches, and not when it does not", async () => {
		const { store, surreal } = connect();
		const open = store.query("task", (q) =>
			q.where({ done: false, priority: { gte: 2 } }),
		);
		const stop = open.subscribe(() => {});
		await waitFor(() => titles(open) === "");
		const writes = store.table("task");

		const fits = writes.create({ title: "Fits", done: false, priority: 5 });
		const wrongDone = writes.create({ title: "Done", done: true, priority: 5 });
		const wrongPriority = writes.create({
			title: "Low",
			done: false,
			priority: 1,
		});
		expect(titles(open)).toBe("Fits");

		await Promise.all([
			fits.committed,
			wrongDone.committed,
			wrongPriority.committed,
		]);
		await new Promise((r) => setTimeout(r, 200));
		expect(titles(open)).toBe("Fits");
		const [stored] = await surreal.query<[{ title: string }[]]>(
			"SELECT * FROM task WHERE done = false AND priority >= 2",
		);
		expect(stored?.map((r) => r.title)).toEqual(["Fits"]);
		stop();
	});

	test("an update that makes a record stop matching removes it at once", async () => {
		const { store, surreal } = connect();
		const writes = store.table("task");
		const a = writes.create({ title: "A", done: false, priority: 1 });
		const b = writes.create({ title: "B", done: false, priority: 2 });
		await Promise.all([a.committed, b.committed]);

		const open = store.query("task", (q) => q.where({ done: false }));
		const stop = open.subscribe(() => {});
		await waitFor(() => titles(open) === "A,B");

		const finish = writes.update(a.id, { done: true });
		expect(titles(open)).toBe("B");
		await finish.committed;
		await new Promise((r) => setTimeout(r, 200));
		expect(titles(open)).toBe("B");

		// Back to matching: the record is not in the result, and the client holds
		// only part of it, so it comes back when the database reports it.
		await writes.update(a.id, { done: false }).committed;
		await waitFor(() => titles(open) === "A,B");
		const [stored] = await surreal.query<[{ title: string }[]]>(
			"SELECT * FROM task WHERE done = false",
		);
		expect(stored).toHaveLength(2);
		stop();
	});

	test("a field the projection does not select shows while its write is pending and goes when the database accepts it", async () => {
		const { db } = connect();
		const store = createStore(db, { idleMs: 20, debounceMs: 400 });
		const writes = store.table("task");
		const { id, committed } = writes.create({
			title: "Rust",
			done: false,
			priority: 1,
		});
		await committed;

		const projected = store.query("task", (q) =>
			q.return((r) => ({ id: r.id, title: r.title })),
		);
		const stop = projected.subscribe(() => {});
		const keys = () => {
			const snap = projected.getSnapshot();
			return snap.status === "success"
				? Object.keys(snap.data[0] ?? {}).sort()
				: [];
		};
		await waitFor(() => keys().length > 0);
		expect(keys()).toEqual(["id", "title"]);

		const edit = writes.update(id, { done: true });
		// A pending write is shown on top of the row, whatever the query selects.
		expect(keys()).toEqual(["done", "id", "title"]);
		await edit.committed;
		// The answer updates only the keys the row has, so the field goes again.
		expect(keys()).toEqual(["id", "title"]);
		stop();
	});

	test("known limitation: a cleared optional field shows its old value from the acknowledgement until the refetch", async () => {
		const { db } = connect();
		const store = createStore(db, { idleMs: 20, debounceMs: 400 });
		const writes = store.table("note");
		const { id, committed } = writes.create({ title: "A", body: "text" });
		await committed;

		// Whole table rows, but not a plain filter, so an answer is merged into them.
		const ordered = store.query("note", (q) => q.orderBy("title").limit(10));
		const body = () => {
			const snap = ordered.getSnapshot();
			return snap.status === "success" ? snap.data[0]?.body : "loading";
		};
		const stop = ordered.subscribe(() => {});
		await waitFor(() => body() === "text");

		const clear = writes.update(id, { body: undefined });
		expect(body()).toBeUndefined();
		const stored = await clear.committed;
		// The answer leaves out a field that is NONE, and the row still holds the
		// old value of a key the answer does not name, so it shows again.
		expect(stored).not.toHaveProperty("body");
		expect(body()).toBe("text");
		// The refetch then reads the field as it is.
		await waitFor(() => body() === undefined);
		stop();
	});

	test("a projected query keeps its shape when the database accepts the caller's own write", async () => {
		const { db } = connect();
		// A long debounce, so the answer to the write is what is read, not the refetch after it.
		const store = createStore(db, { idleMs: 20, debounceMs: 400 });
		const writes = store.table("task");
		const { id, committed } = writes.create({
			title: "Rust",
			done: false,
			priority: 1,
		});
		await committed;

		const projected = store.query("task", (q) =>
			q.return((r) => ({ id: r.id, title: r.title, extra: r.title.len() })),
		);
		const stop = projected.subscribe(() => {});
		const row = () => {
			const snap = projected.getSnapshot();
			return snap.status === "success" ? snap.data[0] : undefined;
		};
		await waitFor(() => row() !== undefined);
		expect(row()).toMatchObject({ title: "Rust", extra: 4 });

		await writes.update(id, { title: "Rust edited" }).committed;
		// The written field shows, the computed column keeps its last value, and
		// the fields the projection left out do not appear.
		expect(Object.keys(row() ?? {}).sort()).toEqual(["extra", "id", "title"]);
		expect(row()).toMatchObject({ title: "Rust edited", extra: 4 });

		// The refetch then brings the column up to date.
		await waitFor(() => row()?.extra === 11);
		expect(Object.keys(row() ?? {}).sort()).toEqual(["extra", "id", "title"]);
		stop();
	});

	test("rows of a projection with no id are kept, not merged, while a write is pending", async () => {
		const { store } = connect();
		const writes = store.table("task");
		const a = writes.create({ title: "A", done: false, priority: 1 });
		const b = writes.create({ title: "B", done: false, priority: 1 });
		const c = writes.create({ title: "C", done: false, priority: 1 });
		await Promise.all([a.committed, b.committed, c.committed]);

		const named = store.query("task", (q) =>
			q.return((r) => ({ title: r.title })),
		);
		const bare = store.query("task", (q) => q.return((r) => r.title));
		const values = () => {
			const snap = bare.getSnapshot();
			return snap.status === "success" ? [...snap.data].sort().join() : "";
		};
		const stops = [named.subscribe(() => {}), bare.subscribe(() => {})];
		await waitFor(() => titles(named) === "A,B,C" && values() === "A,B,C");

		// A pending write applies to the result as it is made. No row says which
		// record it came from, so none is changed and none is taken for another.
		const edit = writes.update(a.id, { priority: 2 });
		expect(titles(named)).toBe("A,B,C");
		expect(values()).toBe("A,B,C");

		await edit.committed;
		await new Promise((r) => setTimeout(r, 200));
		expect(titles(named)).toBe("A,B,C");
		expect(values()).toBe("A,B,C");
		for (const stop of stops) stop();
	});

	test("a projection that has no value for some records does not break writes", async () => {
		const { store } = connect();
		const writes = store.table("note");
		const a = writes.create({ title: "A" });
		const b = writes.create({ title: "B", body: "text" });
		await Promise.all([a.committed, b.committed]);

		// On 3.2.3 the record with no `body` is a row that is `undefined`, not an
		// object. Whatever the server returns, the rows must survive a write.
		const bodies = store.query("note", (q) => q.return((r) => r.body));
		const count = () => {
			const snap = bodies.getSnapshot();
			return snap.status === "success" ? snap.data.length : -1;
		};
		const stop = bodies.subscribe(() => {});
		await waitFor(() => count() > 0);
		const rows = count();

		const edit = writes.update(a.id, { title: "A2" });
		expect(count()).toBe(rows);
		// The answer to the write is recorded without being matched to any row.
		await edit.committed;
		expect(count()).toBe(rows);
		stop();
	});

	test("a query with a callback filter does not show a created record until the database has it", async () => {
		const { store } = connect();
		const open = store.query("task", (q) => q.where((r) => r.done.eq(false)));
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

	test("an ordered query does not place a created record before the database has ordered it", async () => {
		const { store, db } = connect();
		await db
			.create("task", "a")
			.content({ title: "A", done: false, priority: 1 });
		const ordered = store.query("task", (q) =>
			q.where({ done: false }).orderBy("priority", "DESC"),
		);
		const stop = ordered.subscribe(() => {});
		await waitFor(() => titles(ordered) === "A");
		const write = store
			.table("task")
			.create({ title: "Top", done: false, priority: 9 });
		expect(titles(ordered)).toBe("A");
		await write.committed;
		const order = () => {
			const snap = ordered.getSnapshot();
			return snap.status === "success"
				? snap.data.map((r) => r.title).join()
				: snap.status;
		};
		await waitFor(() => order() === "Top,A");
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

describe("Store writes that conflict (integration)", () => {
	const contended = table("contended", { n: t.number(), slow: t.bool() });
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			// The event holds a write that sets `slow` open, so while it waits another
			// write to the record commits first and the held one is the one that conflicts.
			await surreal.query(`
				DEFINE TABLE contended SCHEMALESS;
				DEFINE EVENT held ON contended WHEN $after.slow = true THEN { sleep(500ms); };
				CREATE contended:c SET n = 0, slow = false;
			`);
		},
	});

	test.skipIf(!structuredConflicts)(
		"a write that conflicts with a concurrent one is sent again, not dropped",
		async () => {
			const { surreal } = getTestDb();
			const other = new Surreal();
			const db = orm(surreal, contended);
			// Every attempt to send the write goes through `update`.
			const attempts = spyOn(db, "update");
			const store = createStore(db, { retry: { minMs: 10, maxMs: 50 } });
			try {
				await other.connect(process.env.SURREAL_URL || "ws://localhost:8000");
				await other.signin({ username: "root", password: "root" });
				await other.use({
					namespace: surreal.namespace,
					database: surreal.database,
				});

				const write = store
					.table("contended")
					.update("c", { n: 1, slow: true });
				// By now the write is inside the database, held open by the event.
				await new Promise((r) => setTimeout(r, 200));
				await other.query("UPDATE contended:c SET n = 2, slow = false");

				await expect(write.committed).resolves.toMatchObject({ n: 1 });
				const [stored] = await surreal.query<[{ n: number }[]]>(
					"SELECT * FROM contended",
				);
				expect(stored?.map((r) => r.n)).toEqual([1]);
				expect(store.pending.getSnapshot()).toHaveLength(0);
				// The first attempt lost the race, so a test that sends once has not
				// seen a conflict at all.
				expect(attempts.mock.calls.length).toBeGreaterThanOrEqual(2);
			} finally {
				store.dispose();
				await other.close();
			}
		},
	);
});

describe("Store gate (integration)", () => {
	const note = table("note", { title: t.string() });
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			// No permissions are given to a guest: it cannot write until it signs in.
			await surreal.query("DEFINE TABLE note SCHEMALESS");
		},
	});

	test("a write kept from an earlier session waits for the sign-in instead of being sent anonymously", async () => {
		const { surreal: admin } = getTestDb();
		const guest = new Surreal();
		const storage = memoryStorage();
		await storage.put(
			1,
			encode({
				table: "note",
				id: "left",
				kind: "create",
				data: { title: "Left" },
			}),
		);
		const rows = async () =>
			(await admin.query<[{ title: string }[]]>("SELECT * FROM note"))[0] ?? [];

		let signedIn = false;
		let writtenBeforeSignIn = -1;
		const store = createStore(orm(guest, note), {
			storage,
			retry: { minMs: 10, maxMs: 50 },
			gate: async () => {
				writtenBeforeSignIn = (await rows()).length;
				await guest.signin({ username: "root", password: "root" });
				signedIn = true;
			},
		});
		try {
			await guest.connect(process.env.SURREAL_URL || "ws://localhost:8000");
			await guest.use({
				namespace: admin.namespace,
				database: admin.database,
			});
			await store.ready;
			await new Promise((r) => setTimeout(r, 200));
			// Not sent, so not refused and dropped: it is still waiting.
			expect(signedIn).toBe(false);
			expect(store.pending.getSnapshot()).toHaveLength(1);

			// The first write of this session needs the connection, so it asks for it.
			await store.table("note").create({ title: "New" }, { id: "new" })
				.committed;
			await waitFor(() => store.pending.getSnapshot().length === 0);
			expect(signedIn).toBe(true);
			expect(writtenBeforeSignIn).toBe(0);
			expect((await rows()).map((r) => r.title).sort()).toEqual([
				"Left",
				"New",
			]);
			expect(await storage.load()).toHaveLength(0);
		} finally {
			store.dispose();
			await guest.close();
		}
	});
});
