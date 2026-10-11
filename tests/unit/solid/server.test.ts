import { describe, expect, test } from "bun:test";

/**
 * Solid does not run effects when rendering on the server, so a query made
 * there subscribes to nothing. Under Bun the default `solid-js` is its server
 * build, so this runs in a fresh process, where no test has swapped in the
 * browser build.
 */
describe("createQuery on the server", () => {
	test("renders loading and starts no live query", async () => {
		const script = `
			import { QueryStore } from "./src";
			import { createQuery } from "./src/solid";
			import { createRoot } from "solid-js";
			let live = 0, fetches = 0;
			const store = new QueryStore({
				mode: "direct", idleMs: 10, debounceMs: 1,
				keyOf: (r) => r.id, keyOfId: String,
				fetch: async () => { fetches++; return []; },
				live: async () => { live++; return () => {}; },
			});
			let status;
			createRoot((dispose) => { status = createQuery(store)().status; });
			await new Promise((r) => setTimeout(r, 50));
			console.log(JSON.stringify({ status, live, fetches }));
			process.exit(0);
		`;
		const proc = Bun.spawnSync(["bun", "-e", script], { cwd: process.cwd() });
		expect(proc.stderr.toString()).toBe("");
		expect(JSON.parse(proc.stdout.toString().trim())).toEqual({
			status: "loading",
			live: 0,
			fetches: 0,
		});
	});
});
