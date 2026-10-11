import { describe, expect, test } from "bun:test";
import { get } from "svelte/store";
import { createStore, orm, t, table } from "../../src";
import { pendingStore, queryStore } from "../../src/svelte";
import { withTestDb } from "./setup";

const task = table("task", { title: t.string(), done: t.bool() });

async function until(check: () => boolean, ms = 10_000) {
	const deadline = Date.now() + ms;
	while (!check()) {
		if (Date.now() > deadline) throw new Error("timed out");
		await new Promise((r) => setTimeout(r, 25));
	}
}

describe("Svelte stores (integration)", () => {
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			await surreal.query("DEFINE TABLE task SCHEMALESS");
		},
	});

	test("a store follows a query and shows its own writes while they are pending", async () => {
		const { surreal } = getTestDb();
		const store = createStore(orm(surreal, task), {
			idleMs: 20,
			debounceMs: 10,
		});
		await surreal.query('CREATE task:a SET title = "A", done = false');

		const open = queryStore(
			store.query("task", (q) => q.where({ done: false })),
		);
		const pending = pendingStore(store);
		const seen: string[] = [];
		const off = open.subscribe((v) => {
			seen.push(
				v.status === "success"
					? v.data
							.map((r) => r.title)
							.sort()
							.join()
					: v.status,
			);
		});
		await until(() => seen.at(-1) === "A");

		const write = store.table("task").create({ title: "B", done: false });
		expect(seen.at(-1)).toBe("A,B");
		expect(get(pending)).toHaveLength(1);

		await write.committed;
		await until(() => get(pending).length === 0);
		await new Promise((r) => setTimeout(r, 200));
		const first = seen.indexOf("A,B");
		expect(seen.slice(first).every((s) => s === "A,B")).toBe(true);
		off();
	});
});
