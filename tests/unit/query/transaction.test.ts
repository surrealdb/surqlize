import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { Transaction, orm, t, table } from "../../../src";

describe("Transaction", () => {
	test("Transaction has query builder methods from Orm", () => {
		expect(Transaction.prototype).toHaveProperty("select");
		expect(Transaction.prototype).toHaveProperty("create");
		expect(Transaction.prototype).toHaveProperty("insert");
		expect(Transaction.prototype).toHaveProperty("update");
		expect(Transaction.prototype).toHaveProperty("upsert");
		expect(Transaction.prototype).toHaveProperty("delete");
		expect(Transaction.prototype).toHaveProperty("relate");
	});

	test("Transaction has commit and cancel methods", () => {
		expect(Transaction.prototype).toHaveProperty("commit");
		expect(Transaction.prototype).toHaveProperty("cancel");
		expect(typeof Transaction.prototype.commit).toBe("function");
		expect(typeof Transaction.prototype.cancel).toBe("function");
	});

	test("Orm has transaction method", () => {
		const user = table("user", { name: t.string() });
		const db = orm(new Surreal(), user);

		expect(db).toHaveProperty("transaction");
		expect(typeof db.transaction).toBe("function");
	});
});
