import type { SurrealSession, SurrealTransaction } from "surrealdb";
import { OrmError } from "../error.ts";
import type { CreateSchemaLookup } from "../schema/lookup.ts";
import { type AnyTable, type MappedTables, Orm } from "../schema/orm.ts";
import type { Query } from "./abstract.ts";

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
		// Cast SurrealTransaction as SurrealSession — safe because the only method
		// Query.execute() calls on it is .query(), which both SurrealSession and
		// SurrealTransaction inherit from SurrealQueryable.
		super(transaction as unknown as SurrealSession, tables, lookup);
		this._transaction = transaction;
	}

	/**
	 * A handle on this same transaction in which every query is also bound to
	 * `signal`. It commits and cancels the transaction just as this one does.
	 *
	 * Only queries are bound to the signal: `commit()` and `cancel()` are not, so
	 * a request that is being abandoned cannot leave the outcome of a commit in
	 * doubt.
	 */
	override withSignal(signal: AbortSignal | undefined): Transaction<T> {
		return new Transaction<T>(
			this._transaction.withSignal(signal),
			this.tables,
			this.lookup,
		);
	}

	/**
	 * Not available inside a transaction: a batch is itself an atomic
	 * transaction, and transactions cannot be nested. Run the queries on the
	 * transaction directly instead.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: mirrors the signature of Orm.batch
	override batch(..._queries: Query<any, any>[]): never {
		throw new OrmError(
			"batch() cannot be used inside a transaction: a batch is already atomic, and transactions cannot be nested. Run the queries on the transaction instead.",
		);
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
