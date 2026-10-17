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
	and,
	displayContext,
	LiveSubscription,
	OrmError,
	or,
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

describe("LIVE SELECT with a match or KNN predicate", () => {
	// SurrealDB accepts a match or KNN predicate in a LIVE SELECT filter, but at
	// the top of the filter it never causes a notification, alone or inside
	// and(), or() and not(). One inside a subquery did deliver on 3.2.3, the
	// only version it was seen on, so every position is refused rather than
	// relied on.
	const doc = table("doc", {
		title: t.string(),
		body: t.string(),
		embedding: t.array(t.number()),
		"a@@b": t.string(),
	});

	const db = orm(new Surreal(), doc);

	test("a full-text match in the callback form is refused", () => {
		expect(() => db.live("doc").where((d) => d.body.search("rust"))).toThrow(
			OrmError,
		);
		expect(() => db.live("doc").where((d) => d.body.search("rust"))).toThrow(
			/live/i,
		);
	});

	test("a numbered full-text match is refused", () => {
		expect(() => db.live("doc").where((d) => d.body.search("rust", 1))).toThrow(
			OrmError,
		);
	});

	test("a full-text match in the object form is refused", () => {
		expect(() => db.live("doc").where({ body: { search: "rust" } })).toThrow(
			OrmError,
		);
	});

	test("a KNN predicate is refused, whichever form it takes", () => {
		expect(() =>
			db
				.live("doc")
				.where((d) => d.embedding.knn([1, 0, 0], 2, { metric: "COSINE" })),
		).toThrow(OrmError);
		expect(() =>
			db.live("doc").where((d) => d.embedding.knn([1, 0, 0], 2, { ef: 40 })),
		).toThrow(OrmError);
	});

	test("a predicate nested in and(), or() and not() is refused", () => {
		expect(() =>
			db.live("doc").where((d) => and(d.title.eq("x"), d.body.search("rust"))),
		).toThrow(OrmError);
		expect(() =>
			db.live("doc").where((d) => or(d.title.eq("x"), d.body.search("rust"))),
		).toThrow(OrmError);
		expect(() =>
			db.live("doc").where((d) => d.body.search("rust").not()),
		).toThrow(OrmError);
		expect(() =>
			db.live("doc").where({ not: { body: { search: "rust" } } }),
		).toThrow(OrmError);
	});

	test("a predicate inside a subquery is refused too", () => {
		expect(() =>
			db.live("doc").where((d) =>
				d.id.inside(
					db
						.select("doc")
						.where((o) => o.body.search("rust"))
						.return((o) => o.id),
				),
			),
		).toThrow(OrmError);
		expect(() =>
			db.live("doc").where((d) =>
				d.id.inside(
					db
						.select("doc")
						.where((o) => o.embedding.knn([1, 0, 0], 1, { ef: 40 }))
						.return((o) => o.id),
				),
			),
		).toThrow(OrmError);
	});

	test("the error says what is known about each position", () => {
		const refused = () => db.live("doc").where((d) => d.body.search("rust"));

		// At the top of the filter a predicate never causes a notification, alone
		// or inside and(), or() and not(). One inside a subquery did deliver on
		// 3.2.3, so the text may not claim that it never does.
		expect(refused).toThrow(
			/top of the filter, alone or inside and\(\), or\(\) and not\(\), it never causes a notification/,
		);
		expect(refused).toThrow(/subquery it did deliver on 3\.2\.3.*refused/);
	});

	test("a predicate added by a later where() is refused", () => {
		const base = db.live("doc").where((d) => d.title.eq("x"));

		expect(() => base.where((d) => d.body.search("rust"))).toThrow(OrmError);
	});

	test("a plain condition is still accepted", () => {
		expect(() => db.live("doc").where((d) => d.title.eq("x"))).not.toThrow();
		expect(() => db.live("doc").where({ title: "x" })).not.toThrow();
	});

	test("an operator's text inside a bound value or an escaped name is not a predicate", () => {
		expect(() =>
			db.live("doc").where((d) => d.body.eq("rust @@ typescript <|2,3|>")),
		).not.toThrow();
		expect(() => db.live("doc").where((d) => d["a@@b"].eq("x"))).not.toThrow();
	});

	test("a refused where() leaves the query it was called on unchanged", () => {
		const base = db.live("doc");

		expect(() => base.where((d) => d.body.search("rust"))).toThrow();
		expect(base[__display](displayContext())).not.toContain("WHERE");
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
