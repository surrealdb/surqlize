import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { withTestDb } from "./setup";

describe("Transaction integration tests", () => {
	const getTestDb = withTestDb({ perTest: true });

	describe("Callback form", () => {
		test("auto-commits on success", async () => {
			const { db } = getTestDb();

			await db.transaction(async (tx) => {
				await tx
					.create("user", "tx_success")
					.set({
						name: { first: "Transaction", last: "User" },
						age: 30,
						email: "tx@example.com",
						created: new Date(),
						updated: new Date(),
					})
					.execute();
			});

			// Verify the record was committed
			const result = await db
				.select(new RecordId("user", "tx_success"))
				.execute();
			expect(result.length).toBe(1);
			expect(result[0].name.first).toBe("Transaction");
		});

		test("auto-cancels on error", async () => {
			const { db } = getTestDb();

			// Create a record first so the table exists for the post-cancel check
			await db
				.create("user", "tx_setup")
				.set({
					name: { first: "Setup", last: "User" },
					age: 1,
					email: "setup@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			try {
				await db.transaction(async (tx) => {
					await tx
						.create("user", "tx_fail")
						.set({
							name: { first: "Failed", last: "User" },
							age: 30,
							email: "fail@example.com",
							created: new Date(),
							updated: new Date(),
						})
						.execute();

					throw new Error("Intentional error");
				});
			} catch {
				// Expected
			}

			// Verify the record was NOT committed
			const result = await db.select(new RecordId("user", "tx_fail")).execute();
			expect(result.length).toBe(0);
		});
	});

	describe("Manual form", () => {
		test("explicit commit persists changes", async () => {
			const { db } = getTestDb();

			const tx = await db.transaction();
			await tx
				.create("user", "tx_manual")
				.set({
					name: { first: "Manual", last: "User" },
					age: 25,
					email: "manual@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();
			await tx.commit();

			const result = await db
				.select(new RecordId("user", "tx_manual"))
				.execute();
			expect(result.length).toBe(1);
			expect(result[0].name.first).toBe("Manual");
		});

		test("explicit cancel discards changes", async () => {
			const { db } = getTestDb();

			// Create a record first so the table exists for the post-cancel check
			await db
				.create("user", "tx_cancel_setup")
				.set({
					name: { first: "Setup", last: "User" },
					age: 1,
					email: "setup@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();

			const tx = await db.transaction();
			await tx
				.create("user", "tx_cancel")
				.set({
					name: { first: "Cancelled", last: "User" },
					age: 25,
					email: "cancel@example.com",
					created: new Date(),
					updated: new Date(),
				})
				.execute();
			await tx.cancel();

			const result = await db
				.select(new RecordId("user", "tx_cancel"))
				.execute();
			expect(result.length).toBe(0);
		});
	});

	describe("Multi-query transactions", () => {
		test("multiple operations in a single transaction", async () => {
			const { db } = getTestDb();

			await db.transaction(async (tx) => {
				await tx
					.create("user", "tx_multi_1")
					.set({
						name: { first: "User", last: "One" },
						age: 20,
						email: "one@example.com",
						created: new Date(),
						updated: new Date(),
					})
					.execute();

				await tx
					.create("user", "tx_multi_2")
					.set({
						name: { first: "User", last: "Two" },
						age: 25,
						email: "two@example.com",
						created: new Date(),
						updated: new Date(),
					})
					.execute();

				await tx.update("user", "tx_multi_1").set({ age: 21 }).execute();
			});

			const user1 = await db
				.select(new RecordId("user", "tx_multi_1"))
				.execute();
			const user2 = await db
				.select(new RecordId("user", "tx_multi_2"))
				.execute();

			expect(user1.length).toBe(1);
			expect(user1[0].age).toBe(21);
			expect(user2.length).toBe(1);
			expect(user2[0].name.first).toBe("User");
		});
	});
});
