import type { Surreal, SurrealTransaction } from "surrealdb";
import type { CreateSchemaLookup } from "../schema/lookup.ts";
import { type AnyTable, type MappedTables, Orm } from "../schema/orm.ts";

/**
 * A transaction that wraps a server-side `SurrealTransaction`.
 *
 * Provides the same query-builder methods as `Orm` (select, create, insert,
 * update, upsert, delete, relate) but routes all queries through the
 * transaction. Call `commit()` to apply changes or `cancel()` to discard them.
 */
export class Transaction<T extends AnyTable[] = AnyTable[]> extends Orm<T> {
	private _transaction: SurrealTransaction;

	constructor(
		transaction: SurrealTransaction,
		tables: MappedTables<T>,
		lookup: CreateSchemaLookup<T>,
	) {
		// Cast SurrealTransaction as Surreal — safe because the only method
		// Query.execute() calls on it is .query(), which both Surreal and
		// SurrealTransaction inherit from SurrealQueryable.
		super(transaction as unknown as Surreal, tables, lookup);
		this._transaction = transaction;
	}

	/**
	 * Commit this transaction to the datastore, applying all changes.
	 */
	async commit(): Promise<void> {
		await this._transaction.commit();
	}

	/**
	 * Cancel this transaction, discarding all changes.
	 */
	async cancel(): Promise<void> {
		await this._transaction.cancel();
	}
}
