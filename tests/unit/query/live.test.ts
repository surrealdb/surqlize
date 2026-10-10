import { describe, expect, test } from "bun:test";
import {
	LiveSubscriptionError,
	NotFoundError,
	RecordId,
	type LiveSubscription as SdkLiveSubscription,
	Surreal,
	type SurrealSession,
	Table,
} from "surrealdb";
import {
	__display,
	displayContext,
	LiveSubscription,
	orm,
	t,
	table,
} from "../../../src";

describe("LIVE SELECT queries", () => {
	const user = table("user", {
		name: t.object({
			first: t.string(),
			last: t.string(),
		}),
		age: t.number(),
		email: t.string(),
		tags: t.array(t.string()),
	});

	const post = table("post", {
		title: t.string(),
		body: t.string(),
		author: t.record("user"),
	});

	const db = orm(new Surreal(), user, post);

	test("generates basic LIVE SELECT", () => {
		const query = db.live("user");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("LIVE SELECT * FROM");
		expect(Object.values(ctx.variables)).toContainEqual(new Table("user"));
	});

	test("a record subject selects its table and filters by id", () => {
		const query = db.live(new RecordId("user", "n1"));
		const ctx = displayContext();
		const sql = query[__display](ctx);

		expect(sql).toMatch(/^LIVE SELECT \* FROM \$\w+ WHERE id = \$\w+$/);
		expect(Object.values(ctx.variables)).toContainEqual(new Table("user"));
		expect(Object.values(ctx.variables)).toContainEqual(
			new RecordId("user", "n1"),
		);
	});

	test("a record subject combined with a where() keeps both conditions", () => {
		const query = db.live("user", "n1").where(($this) => $this.age.gt(18));
		const sql = query[__display](displayContext());

		expect(sql).toMatch(/WHERE id = \$\w+ AND \(\$this\.age > \$\w+\)$/);
	});

	test("generates LIVE SELECT with WHERE", () => {
		const query = db.live("user").where(($this) => $this.age.gt(18));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("LIVE SELECT * FROM");
		expect(result).toContain("WHERE");
		expect(result).toContain(">");
	});

	test("generates LIVE SELECT DIFF", () => {
		const query = db.live("user").diff();
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("LIVE SELECT DIFF FROM");
	});

	test("generates LIVE SELECT with VALUE projection via return", () => {
		const query = db.live("user").return(($this) => ({
			name: $this.name,
			email: $this.email,
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("LIVE SELECT VALUE");
		expect(result).toContain("email");
	});

	test("generates LIVE SELECT with FETCH", () => {
		const query = db.live("post").fetch("author");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("LIVE SELECT * FROM");
		expect(result).toContain("FETCH author");
	});

	test("combines WHERE and FETCH", () => {
		const query = db
			.live("post")
			.where(($this) => $this.title.contains("hello"))
			.fetch("author");
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("LIVE SELECT * FROM");
		expect(result).toContain("WHERE");
		expect(result).toContain("FETCH author");
	});

	test("does not emit clauses unsupported by LIVE SELECT", () => {
		const query = db.live("user").where(($this) => $this.age.gte(18));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).not.toContain("LIMIT");
		expect(result).not.toContain("START");
		expect(result).not.toContain("ORDER BY");
		expect(result).not.toContain("GROUP");
	});
});

describe("LIVE SELECT registration", () => {
	const user = table("user", { name: t.string() });

	/** A session whose managed `live()` settles as given. */
	function liveSession(outcome: () => Promise<unknown>) {
		return { live: outcome } as unknown as SurrealSession;
	}

	test("surfaces the server's error, not the SDK's generic wrapper", async () => {
		const cause = new NotFoundError({
			message: "The table 'user' does not exist",
		} as never);
		const db = orm(
			liveSession(() => Promise.reject(new LiveSubscriptionError(cause))),
			user,
		);

		// The wrapper's own message is only "Live subscription failed to listen".
		await expect(db.live("user").execute()).rejects.toBe(cause);
	});

	test("rethrows an error that is not a wrapped registration failure as it is", async () => {
		const error = new Error("something else");
		const db = orm(
			liveSession(() => Promise.reject(error)),
			user,
		);

		await expect(db.live("user").execute()).rejects.toBe(error);
	});

	test("stop() does not leave an unhandled rejection when kill() fails", async () => {
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => unhandled.push(reason);
		process.on("unhandledRejection", onUnhandled);
		try {
			const inner = {
				id: undefined,
				isAlive: true,
				isManaged: true,
				subscribe: () => () => {},
				kill: () => Promise.reject(new Error("connection is gone")),
			};
			const db = orm(
				liveSession(() => Promise.resolve(inner)),
				user,
			);

			const stop = await db.live("user").subscribe(() => {});
			stop();
			// Let the rejected promise reach the runtime's unhandled-rejection check.
			await new Promise((resolve) => setTimeout(resolve, 25));

			expect(unhandled).toEqual([]);
		} finally {
			process.off("unhandledRejection", onUnhandled);
		}
	});

	/**
	 * A killed SDK subscription. Its `subscribe()` is the SDK's: an async loop with
	 * no `catch`, which rejects because iterating a killed subscription throws.
	 */
	function killedSdkSubscription() {
		return {
			id: undefined,
			isAlive: false,
			isManaged: true,
			kill: () => Promise.resolve(),
			subscribe(this: unknown, handler: (message: unknown) => void) {
				void (async () => {
					for await (const message of this as AsyncIterable<unknown>) {
						handler(message);
					}
				})();
				return () => {};
			},
			[Symbol.asyncIterator]() {
				throw new LiveSubscriptionError("Subscription has been killed");
			},
		};
	}

	test("subscribe() on a killed subscription raises no unhandled rejection", async () => {
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => unhandled.push(reason);
		process.on("unhandledRejection", onUnhandled);
		try {
			const sub = new LiveSubscription(
				killedSdkSubscription() as unknown as SdkLiveSubscription<unknown>,
				(value) => value,
			);
			sub.subscribe(() => {})();
			await new Promise((resolve) => setTimeout(resolve, 25));

			expect(unhandled).toEqual([]);
		} finally {
			process.off("unhandledRejection", onUnhandled);
		}
	});

	test("iterating a killed subscription ends at once, without throwing", async () => {
		const sub = new LiveSubscription(
			killedSdkSubscription() as unknown as SdkLiveSubscription<unknown>,
			(value) => value,
		);
		const seen: unknown[] = [];
		for await (const message of sub) seen.push(message);

		expect(seen).toEqual([]);
	});

	test("an error from a live stream is rethrown, not dropped", async () => {
		// Only a stream that ends or is killed is expected to fail quietly. A failure
		// while the subscription is alive is a real error, so it is rethrown as an
		// uncaught exception, as an EventEmitter 'error' is with no listener.
		const error = new Error("stream broke");
		const alive = {
			id: undefined,
			isAlive: true,
			isManaged: true,
			kill: () => Promise.resolve(),
			subscribe: () => () => {},
			[Symbol.asyncIterator]: () => ({
				next: () => Promise.reject(error),
			}),
		};
		// The rethrow is scheduled with queueMicrotask. Capture it, rather than letting
		// it fail this test as an uncaught exception, and check what it throws.
		const scheduled: (() => void)[] = [];
		const original = globalThis.queueMicrotask;
		globalThis.queueMicrotask = (callback) => {
			scheduled.push(callback);
		};
		try {
			new LiveSubscription(
				alive as unknown as SdkLiveSubscription<unknown>,
				(value) => value,
			).subscribe(() => {});
			await new Promise((resolve) => setTimeout(resolve, 25));

			expect(scheduled).toHaveLength(1);
			let thrown: unknown;
			try {
				scheduled[0]!();
			} catch (caught) {
				thrown = caught;
			}
			expect(thrown).toBe(error);
		} finally {
			globalThis.queueMicrotask = original;
		}
	});
});
