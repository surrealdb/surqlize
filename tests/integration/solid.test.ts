import { beforeAll, describe, expect, mock, test } from "bun:test";
import { createStore, orm, t, table } from "../../src";
import { withTestDb } from "./setup";

// Under Bun `solid-js` is its server build, where effects never run; the
// browser build is swapped in before the bindings are imported.
type Solid = typeof import("solid-js");
type Bindings = typeof import("../../src/solid");
let solid: Solid;
let bindings: Bindings;

beforeAll(async () => {
	// The path has no declaration file, so it is imported by name at run time.
	const browser: Solid = await import("solid-js/dist/solid.js" as string);
	mock.module("solid-js", () => browser);
	solid = await import("solid-js");
	bindings = await import("../../src/solid");
});

const task = table("task", { title: t.string(), done: t.bool() });

async function until(check: () => boolean, ms = 10_000) {
	const deadline = Date.now() + ms;
	while (!check()) {
		if (Date.now() > deadline) throw new Error("timed out");
		await new Promise((r) => setTimeout(r, 25));
	}
}

describe("Solid primitives (integration)", () => {
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

		let dispose = () => {};
		const view = solid.createRoot((d) => {
			dispose = d;
			return {
				open: bindings.createQuery(
					store.query("task", (q) => q.where({ done: false })),
				),
				pending: bindings.createPending(store),
			};
		});
		const titles = () => {
			const s = view.open();
			return s.status === "success"
				? s.data
						.map((r) => r.title)
						.sort()
						.join()
				: s.status;
		};
		await until(() => titles() === "A");

		const write = store.table("task").create({ title: "B", done: false });
		expect(titles()).toBe("A,B");
		expect(view.pending()).toHaveLength(1);

		await write.committed;
		await until(() => view.pending().length === 0);
		await new Promise((r) => setTimeout(r, 200));
		expect(titles()).toBe("A,B");
		dispose();
	});
});
