import { describe, expect, test } from "bun:test";
import {
	BoundQuery,
	RecordId,
	Surreal,
	type SurrealSession,
	type TransactionOptions,
} from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

type TransactionCall = {
	queries: readonly unknown[];
	options: TransactionOptions | undefined;
};

/**
 * A stand-in for the SDK's stateless `transaction()`, which resolves to one
 * result per statement. `signals` records each `withSignal()` the connection is
 * bound through before the transaction is sent.
 */
function mockSurrealTransaction(results: unknown[]) {
	const calls: TransactionCall[] = [];
	const signals: AbortSignal[] = [];
	const surreal = {
		transaction: (
			queries: readonly unknown[],
			options?: TransactionOptions,
		) => {
			calls.push({ queries, options });
			return Promise.resolve(results);
		},
		withSignal: (signal: AbortSignal) => {
			signals.push(signal);
			return surreal;
		},
	};
	return { surreal: surreal as unknown as SurrealSession, calls, signals };
}

describe("BATCH queries", () => {
	const user = table("user", {
		name: t.string(),
		age: t.number(),
		email: t.string(),
	});

	const post = table("post", {
		title: t.string(),
		body: t.string(),
	});

	const db = orm(new Surreal(), user, post);

	test("generates BEGIN/COMMIT wrapping", () => {
		const b = db.batch(db.create("user").set({ name: "Alice", age: 30 }));
		const result = b.toString();

		expect(result).toStartWith("BEGIN TRANSACTION;");
		expect(result).toEndWith("COMMIT TRANSACTION;");
	});

	test("includes multiple statements", () => {
		const b = db.batch(
			db.create("user").set({ name: "Alice", age: 30 }),
			db.update("user").set({ age: 31 }),
		);
		const result = b.toString();

		expect(result).toContain("CREATE");
		expect(result).toContain("UPDATE");
	});

	test("shares variables across queries via DisplayContext", () => {
		const b = db.batch(
			db.create("user").set({ name: "Alice", age: 30 }),
			db.create("user").set({ name: "Bob", age: 25 }),
		);
		const ctx = displayContext();
		b[__display](ctx);

		// Variables should include values from both queries
		const vars = Object.values(ctx.variables);
		expect(vars).toContainEqual("Alice");
		expect(vars).toContainEqual("Bob");
		expect(vars).toContainEqual(30);
		expect(vars).toContainEqual(25);
	});

	test("strips parentheses from individual queries", () => {
		const b = db.batch(db.select("user"));
		const result = b.toString();

		// Should not have nested parentheses from individual queries
		expect(result).not.toContain("(SELECT");
		expect(result).toContain("SELECT * FROM");
	});

	test("generates correct SurrealQL for mixed operations", () => {
		const b = db.batch(
			db.create("user").set({ name: "Alice" }),
			db.select("user"),
			db.delete("user"),
		);
		const result = b.toString();

		expect(result).toStartWith("BEGIN TRANSACTION;");
		expect(result).toContain("CREATE");
		expect(result).toContain("SELECT");
		expect(result).toContain("DELETE");
		expect(result).toEndWith("COMMIT TRANSACTION;");
	});

	test("generates correct SurrealQL for single query", () => {
		const b = db.batch(
			db.create("post").set({ title: "Hello", body: "World" }),
		);
		const result = b.toString();

		expect(result).toStartWith("BEGIN TRANSACTION;");
		expect(result).toContain("CREATE");
		expect(result).toContain("SET");
		expect(result).toEndWith("COMMIT TRANSACTION;");
	});

	test("statements are separated by semicolons", () => {
		const b = db.batch(
			db.create("user").set({ name: "Alice" }),
			db.create("post").set({ title: "Post" }),
		);
		const result = b.toString();

		// Match: "BEGIN TRANSACTION; <stmt1>; <stmt2>; COMMIT TRANSACTION;"
		const parts = result.split("; ");
		expect(parts.length).toBeGreaterThanOrEqual(4);
		expect(parts[0]).toBe("BEGIN TRANSACTION");
		expect(parts[parts.length - 1]).toBe("COMMIT TRANSACTION;");
	});

	test("toString matches __display output", () => {
		const b = db.batch(db.select("user").where(($this) => $this.age.gt(18)));
		const str = b.toString();
		const ctx = displayContext();
		const display = b[__display](ctx);

		expect(str).toContain("BEGIN TRANSACTION;");
		expect(display).toContain("BEGIN TRANSACTION;");
		expect(str).toContain("WHERE");
		expect(display).toContain("WHERE");
	});

	test("reuses single-query parse behavior for RETURN DIFF", async () => {
		const { surreal } = mockSurrealTransaction([
			[{ op: "replace", path: "/age", value: 31 }],
		]);
		const batchDb = orm(surreal, user, post);

		const result = (await batchDb
			.batch(batchDb.update("user", "alice").set({ age: 31 }).return("diff"))
			.execute()) as unknown as [
			Array<{
				op: string;
				path: string;
				value: number;
			}>,
		];

		expect(result[0]).toEqual([{ op: "replace", path: "/age", value: 31 }]);
	});

	test("Orm has batch method", () => {
		expect(db).toHaveProperty("batch");
		expect(typeof db.batch).toBe("function");
	});

	describe("execution through the SDK's transaction()", () => {
		test("sends the statements as one bound query, without BEGIN/COMMIT", async () => {
			const { surreal, calls } = mockSurrealTransaction([[], []]);
			const batchDb = orm(surreal, user, post);

			await batchDb.batch(
				batchDb.create("user").set({ name: "Alice", age: 30 }),
				batchDb.create("user").set({ name: "Bob", age: 25 }),
			);

			expect(calls).toHaveLength(1);
			const [sent] = calls[0]!.queries as [BoundQuery];
			expect(calls[0]!.queries).toHaveLength(1);
			expect(sent).toBeInstanceOf(BoundQuery);
			// The SDK adds BEGIN/COMMIT itself; sending them too would nest.
			expect(sent.query).not.toContain("BEGIN");
			expect(sent.query).not.toContain("COMMIT");
			// Two statements, with the bindings of both under distinct names.
			expect(sent.query.split("; ")).toHaveLength(2);
			expect(Object.values(sent.bindings)).toEqual(
				expect.arrayContaining(["Alice", "Bob", 30, 25]),
			);
		});

		test("maps results to queries positionally", async () => {
			const { surreal } = mockSurrealTransaction([
				[
					{
						id: new RecordId("user", "a"),
						name: "Alice",
						age: 30,
						email: "a@x.io",
					},
				],
				[],
			]);
			const batchDb = orm(surreal, user, post);

			const [created, posts] = await batchDb.batch(
				batchDb.create("user").set({ name: "Alice", age: 30 }),
				batchDb.select("post"),
			);

			expect(created).toHaveLength(1);
			expect(posts).toEqual([]);
		});

		test("an empty batch sends an empty list, not an empty statement", async () => {
			const { surreal, calls } = mockSurrealTransaction([]);
			const batchDb = orm(surreal, user, post);

			expect(await batchDb.batch()).toEqual([]);
			// The SDK resolves `[]` itself, and rejects an empty BoundQuery.
			expect(calls).toHaveLength(1);
			expect(calls[0]?.queries).toEqual([]);
		});

		test("sends no options by default", async () => {
			const { surreal, calls } = mockSurrealTransaction([[]]);
			const batchDb = orm(surreal, user, post);

			await batchDb.batch(batchDb.select("user"));

			expect(calls[0]!.options).toEqual({
				retry: undefined,
				requestTimeout: undefined,
			});
		});

		test(".retry() and .requestTimeout() are forwarded to the transaction", async () => {
			const { surreal, calls } = mockSurrealTransaction([[]]);
			const batchDb = orm(surreal, user, post);

			await batchDb
				.batch(batchDb.select("user"))
				.retry({ attempts: 3 })
				.requestTimeout(500);
			await batchDb.batch(batchDb.select("user")).retry();

			expect(calls[0]!.options).toEqual({
				retry: { attempts: 3 },
				requestTimeout: 500,
			});
			expect(calls[1]!.options?.retry).toBe(true);
		});

		test(".signal() binds the connection to every signal, in order", async () => {
			const { surreal, signals } = mockSurrealTransaction([[]]);
			const batchDb = orm(surreal, user, post);
			const first = new AbortController().signal;
			const second = new AbortController().signal;

			await batchDb.batch(batchDb.select("user")).signal(first).signal(second);

			expect(signals).toEqual([first, second]);
		});

		test("a missing signal is ignored", async () => {
			const { surreal, signals } = mockSurrealTransaction([[]]);
			const batchDb = orm(surreal, user, post);

			await batchDb.batch(batchDb.select("user")).signal(undefined);

			expect(signals).toEqual([]);
		});

		test("request options are immutable: each call derives a new batch", async () => {
			const { surreal, calls } = mockSurrealTransaction([[]]);
			const batchDb = orm(surreal, user, post);

			const base = batchDb.batch(batchDb.select("user"));
			const retried = base.retry();
			const timed = base.requestTimeout(250);

			await base;
			await retried;
			await timed;

			expect(calls[0]!.options?.retry).toBeUndefined();
			expect(calls[1]!.options?.retry).toBe(true);
			expect(calls[2]!.options?.retry).toBeUndefined();
			expect(calls[2]!.options?.requestTimeout).toBe(250);
			expect(base).not.toBe(retried);
		});
	});

	test("batch() is rejected inside an interactive transaction", async () => {
		const txn = {
			query: () => Promise.resolve([]),
			commit: () => Promise.resolve(),
			cancel: () => Promise.resolve(),
		};
		const surreal = {
			beginTransaction: () => Promise.resolve(txn),
		} as unknown as SurrealSession;
		const txDb = orm(surreal, user, post);

		const tx = await txDb.transaction();

		expect(() => tx.batch()).toThrow(/cannot be used inside a transaction/);
	});
});
