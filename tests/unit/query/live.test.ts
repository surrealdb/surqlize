import { describe, expect, test } from "bun:test";
import {
	LiveSubscriptionError,
	NotFoundError,
	Surreal,
	type SurrealSession,
	Table,
} from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

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
});
