import { afterEach, describe, expect, test } from "bun:test";
import { createElement, StrictMode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { createStore, orm, t, table } from "../../src";
import { StoreProvider, usePending, useQuery, useStore } from "../../src/react";
import { withTestDb } from "./setup";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const warn = console.error;
console.error = (...args: unknown[]) => {
	if (String(args[0]).includes("react-test-renderer is deprecated")) return;
	warn(...args);
};

const task = table("task", {
	title: t.string(),
	done: t.bool(),
	priority: t.number(),
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function until(check: () => boolean, ms = 10_000) {
	const deadline = Date.now() + ms;
	while (!check()) {
		if (Date.now() > deadline) throw new Error("timed out");
		await sleep(25);
	}
}

let renderer: ReactTestRenderer | undefined;
afterEach(() => {
	renderer?.unmount();
	renderer = undefined;
});

describe("React bindings (integration)", () => {
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			await surreal.query("DEFINE TABLE task SCHEMALESS");
		},
	});

	test("a component follows a query, shows its own writes at once, and settles on the database's", async () => {
		const { surreal } = getTestDb();
		const store = createStore(orm(surreal, task), {
			idleMs: 20,
			debounceMs: 10,
		});
		await surreal.query(
			'CREATE task:a SET title = "A", done = false, priority = 1',
		);

		const rendered: string[] = [];
		let pendingCount = -1;
		let write: () => { committed: Promise<unknown> } = () => ({
			committed: Promise.resolve(),
		});

		const List = () => {
			const shared = useStore<typeof store.db>();
			const open = useQuery(
				shared.query("task", (q) => q.where({ done: false })),
			);
			const pending = usePending(store);
			pendingCount = pending.length;
			write = () =>
				store.table("task").create({ title: "B", done: false, priority: 2 });
			rendered.push(
				`${
					open.status === "success"
						? open.data
								.map((r) => r.title)
								.sort()
								.join()
						: open.status
				}|${pending.length}`,
			);
			return null;
		};

		renderer = create(
			createElement(
				StrictMode,
				null,
				createElement(StoreProvider, { store }, createElement(List)),
			),
		);
		await until(() => rendered.at(-1)?.startsWith("A|") === true);

		const { committed } = write();
		await committed;
		await until(() => pendingCount === 0);
		await sleep(200);

		// The component showed the write while it was still pending...
		const first = rendered.findIndex((r) => r.startsWith("A,B|"));
		expect(first).toBeGreaterThan(-1);
		expect(rendered[first]).toBe("A,B|1");
		// ...and once the database had it, the row never went missing.
		expect(rendered.slice(first).every((r) => r.startsWith("A,B|"))).toBe(true);
		expect(rendered.at(-1)).toBe("A,B|0");
	});
});
