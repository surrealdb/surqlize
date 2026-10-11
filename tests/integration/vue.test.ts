import { describe, expect, test } from "bun:test";
import { effectScope } from "vue";
import { createStore, orm, t, table } from "../../src";
import { usePending, useQuery } from "../../src/vue";
import { withTestDb } from "./setup";

const task = table("task", { title: t.string(), done: t.bool() });

async function until(check: () => boolean, ms = 10_000) {
	const deadline = Date.now() + ms;
	while (!check()) {
		if (Date.now() > deadline) throw new Error("timed out");
		await new Promise((r) => setTimeout(r, 25));
	}
}

describe("Vue composables (integration)", () => {
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			await surreal.query("DEFINE TABLE task SCHEMALESS");
		},
	});

	test("a query follows the table and shows its own writes while they are pending", async () => {
		const { surreal } = getTestDb();
		const store = createStore(orm(surreal, task), {
			idleMs: 20,
			debounceMs: 10,
		});
		await surreal.query('CREATE task:a SET title = "A", done = false');

		const scope = effectScope();
		const view = scope.run(() => ({
			open: useQuery(store.query("task", (q) => q.where({ done: false }))),
			pending: usePending(store),
		}));
		if (!view) throw new Error("no scope");
		const titles = () =>
			view.open.value.status === "success"
				? view.open.value.data
						.map((r) => r.title)
						.sort()
						.join()
				: view.open.value.status;
		await until(() => titles() === "A");

		const write = store.table("task").create({ title: "B", done: false });
		expect(titles()).toBe("A,B");
		expect(view.pending.value).toHaveLength(1);

		await write.committed;
		await until(() => view.pending.value.length === 0);
		await new Promise((r) => setTimeout(r, 200));
		expect(titles()).toBe("A,B");
		scope.stop();
	});
});
