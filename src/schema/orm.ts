import type { SurrealSession } from "surrealdb";
import { RecordId, type RecordIdValue } from "surrealdb";
import type { Query } from "../query/abstract";
import { BatchQuery } from "../query/batch";
import { CreateQuery } from "../query/create";
import { DeleteQuery } from "../query/delete";
import { InsertQuery } from "../query/insert";
import { RelateQuery } from "../query/relate";
import { SelectQuery } from "../query/select";
import type { Transaction } from "../query/transaction";
import { UpdateQuery } from "../query/update";
import { UpsertQuery } from "../query/upsert";
import type { ArrayType, RecordType } from "../types";
import { isWorkable, type Workable, type WorkableContext } from "../utils";
import { EdgeSchema } from "./edge";
import { type CreateSchemaLookup, createLookupFromSchemas } from "./lookup";
import type { TableSchema } from "./table";

/** Union type representing any table or edge schema. */
export type AnyTable<Tb extends string = string> =
	| TableSchema<Tb>
	| EdgeSchema<string, Tb>;

/** Maps an array of table/edge schemas to a record keyed by table name. */
export type MappedTables<T extends AnyTable[]> = {
	[K in T[number]["tb"]]: Extract<T[number], AnyTable<K>>;
} & {};

/**
 * The main ORM entry point. Provides type-safe query builders for all
 * registered tables and edges.
 *
 * Use the {@link orm} factory function to create instances rather than
 * calling the constructor directly.
 */
export class Orm<T extends AnyTable[] = AnyTable[]> {
	constructor(
		public readonly surreal: SurrealSession,
		public readonly tables: MappedTables<T>,
		public readonly lookup: CreateSchemaLookup<T>,
	) {}

	/**
	 * Build a SELECT query for a table, record ID, or workable record reference.
	 *
	 * @param tb - A table name, `RecordId`, workable record, or table name with a second `id` argument.
	 * @returns A {@link SelectQuery} that can be further chained or awaited.
	 */
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb): SelectQuery<this, C, Tb>;

	// RecordId
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: RecordId<Tb>): SelectQuery<this, C, Tb>;
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: Workable<C, RecordType<Tb>>): SelectQuery<this, C, Tb>;
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, id: RecordIdValue): SelectQuery<this, C, Tb>;

	// Method
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb | RecordId<Tb> | Workable<C, RecordType<Tb>>, id?: RecordIdValue) {
		if (tb instanceof RecordId) return new SelectQuery(this, tb);
		if (isWorkable(tb))
			return new SelectQuery(this, tb as Workable<C, RecordType<Tb>>);
		if (id === undefined) return new SelectQuery(this, tb as Tb);
		return new SelectQuery(this, new RecordId(tb as Tb, id));
	}

	/**
	 * Build a CREATE query. Optionally pass a specific record ID.
	 *
	 * @param tb - The table name.
	 * @param id - Optional record ID.
	 * @returns A {@link CreateQuery} that can be further chained or awaited.
	 */
	create<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb): CreateQuery<this, C, Tb>;

	// CREATE - with explicit ID
	create<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, id: RecordIdValue): CreateQuery<this, C, Tb>;

	// Method
	create<
		_C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, id?: RecordIdValue) {
		return new CreateQuery(this, tb, id?.toString());
	}

	/**
	 * Build an INSERT query. Pass data inline or use the `.fields().values()` API.
	 *
	 * @param tb - The table name.
	 * @param data - Optional record or array of records to insert.
	 * @returns An {@link InsertQuery} that can be further chained or awaited.
	 */
	insert<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, data: unknown | unknown[]): InsertQuery<this, C, Tb>;

	// INSERT without data (for VALUES syntax)
	insert<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb): InsertQuery<this, C, Tb>;

	// Method
	insert<
		_C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, data?: unknown | unknown[]) {
		return new InsertQuery(this, tb, data);
	}

	/**
	 * Build an UPDATE query for a table, record ID, or workable record reference.
	 *
	 * @param tb - A table name, `RecordId`, workable record, or table name with a second `id` argument.
	 * @returns An {@link UpdateQuery} that can be further chained or awaited.
	 */
	update<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb): UpdateQuery<this, C, Tb>;

	// UPDATE - record ID
	update<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: RecordId<Tb>): UpdateQuery<this, C, Tb>;
	update<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: Workable<C, RecordType<Tb>>): UpdateQuery<this, C, Tb>;
	update<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, id: RecordIdValue): UpdateQuery<this, C, Tb>;

	// Method
	update<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb | RecordId<Tb> | Workable<C, RecordType<Tb>>, id?: RecordIdValue) {
		if (tb instanceof RecordId) return new UpdateQuery(this, tb);
		if (isWorkable(tb))
			return new UpdateQuery(this, tb as Workable<C, RecordType<Tb>>);
		if (id === undefined) return new UpdateQuery(this, tb as Tb);
		return new UpdateQuery(this, new RecordId(tb as Tb, id));
	}

	/**
	 * Build a DELETE query for a table, record ID, or workable record reference.
	 *
	 * @param tb - A table name, `RecordId`, workable record, or table name with a second `id` argument.
	 * @returns A {@link DeleteQuery} that can be further chained or awaited.
	 */
	delete<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb): DeleteQuery<this, C, Tb>;

	// DELETE - record ID
	delete<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: RecordId<Tb>): DeleteQuery<this, C, Tb>;
	delete<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: Workable<C, RecordType<Tb>>): DeleteQuery<this, C, Tb>;
	delete<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, id: RecordIdValue): DeleteQuery<this, C, Tb>;

	// Method
	delete<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb | RecordId<Tb> | Workable<C, RecordType<Tb>>, id?: RecordIdValue) {
		if (tb instanceof RecordId) return new DeleteQuery(this, tb);
		if (isWorkable(tb))
			return new DeleteQuery(this, tb as Workable<C, RecordType<Tb>>);
		if (id === undefined) return new DeleteQuery(this, tb as Tb);
		return new DeleteQuery(this, new RecordId(tb as Tb, id));
	}

	/**
	 * Build an UPSERT query for a table, record ID, or workable record reference.
	 *
	 * @param tb - A table name, `RecordId`, workable record, or table name with a second `id` argument.
	 * @returns An {@link UpsertQuery} that can be further chained or awaited.
	 */
	upsert<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb): UpsertQuery<this, C, Tb>;

	// UPSERT - record ID
	upsert<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: RecordId<Tb>): UpsertQuery<this, C, Tb>;
	upsert<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: Workable<C, RecordType<Tb>>): UpsertQuery<this, C, Tb>;
	upsert<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, id: RecordIdValue): UpsertQuery<this, C, Tb>;

	// Method
	upsert<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb | RecordId<Tb> | Workable<C, RecordType<Tb>>, id?: RecordIdValue) {
		if (tb instanceof RecordId) return new UpsertQuery(this, tb);
		if (isWorkable(tb))
			return new UpsertQuery(this, tb as Workable<C, RecordType<Tb>>);
		if (id === undefined) return new UpsertQuery(this, tb as Tb);
		return new UpsertQuery(this, new RecordId(tb as Tb, id));
	}

	/**
	 * Build a RELATE query to create a graph edge between records.
	 *
	 * @param edge - The edge table name (must be an {@link EdgeSchema}).
	 * @param from - The source record(s).
	 * @param to - The target record(s).
	 * @returns A {@link RelateQuery} that can be further chained or awaited.
	 */
	relate<
		C extends WorkableContext<this>,
		Edge extends keyof this["tables"] & string,
	>(
		edge: Edge,
		from:
			| RecordId
			| RecordId[]
			| Workable<C, RecordType>
			| Workable<C, ArrayType<RecordType>>,
		to:
			| RecordId
			| RecordId[]
			| Workable<C, RecordType>
			| Workable<C, ArrayType<RecordType>>,
	): RelateQuery<this, C, Edge>;

	// Method
	relate<
		C extends WorkableContext<this>,
		Edge extends keyof this["tables"] & string,
	>(
		edge: Edge,
		from:
			| RecordId
			| RecordId[]
			| Workable<C, RecordType>
			| Workable<C, ArrayType<RecordType>>,
		to:
			| RecordId
			| RecordId[]
			| Workable<C, RecordType>
			| Workable<C, ArrayType<RecordType>>,
	) {
		const edgeSchema = this.tables[edge];

		// Validate it's an EdgeSchema
		if (!(edgeSchema instanceof EdgeSchema)) {
			throw new Error(`"${edge}" is not an edge table`);
		}

		return new RelateQuery(this, edge, from, to);
	}

	/**
	 * Combine multiple queries into a single atomic batch operation wrapped in
	 * `BEGIN TRANSACTION; ...; COMMIT TRANSACTION;`.
	 *
	 * @param queries - The queries to batch together.
	 * @returns A {@link BatchQuery} that can be awaited.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: required for generic constraint flexibility
	batch<Q extends Query<any, any>[]>(...queries: Q): BatchQuery<Q> {
		return new BatchQuery(this.surreal, queries);
	}

	/**
	 * Start a transaction. Supports two forms:
	 *
	 * **Callback form** -- automatically commits on success and cancels on error:
	 * ```ts
	 * const result = await db.transaction(async (tx) => {
	 *   await tx.create("user").set({ ... });
	 *   return "done";
	 * });
	 * ```
	 *
	 * **Manual form** -- returns a {@link Transaction} for explicit commit/cancel:
	 * ```ts
	 * const tx = await db.transaction();
	 * await tx.create("user").set({ ... });
	 * await tx.commit();
	 * ```
	 */
	transaction<R>(cb: (tx: Transaction<T>) => Promise<R>): Promise<R>;
	transaction(): Promise<Transaction<T>>;

	// Method
	async transaction<R>(
		cb?: (tx: Transaction<T>) => Promise<R>,
	): Promise<Transaction<T> | R> {
		// Dynamic import to avoid circular dependency
		// (Transaction extends Orm)
		const { Transaction: Tx } = await import("../query/transaction");
		const surrealTx = await this.surreal.beginTransaction();
		const tx = new Tx<T>(surrealTx, this.tables, this.lookup);

		if (!cb) return tx;

		try {
			const result = await cb(tx);
			await tx.commit();
			return result;
		} catch (e) {
			await tx.cancel();
			throw e;
		}
	}
}

/**
 * Create an ORM instance bound to a SurrealDB session and a set of table/edge
 * schemas. This is the main entry point for building type-safe queries.
 *
 * @param surreal - An active SurrealDB session.
 * @param tables - One or more {@link TableSchema} or {@link EdgeSchema} definitions.
 * @returns An {@link Orm} instance with query builders scoped to the provided schemas.
 *
 * @example
 * ```ts
 * const db = orm(new Surreal(), user, post, authored);
 * const users = await db.select("user");
 * ```
 */
export function orm<T extends AnyTable[]>(
	surreal: SurrealSession,
	...tables: T
) {
	const mapped = tables.reduce<MappedTables<T>>(
		(acc, table) => {
			const key = table.tb as T[number]["tb"];
			acc[key] = table as Extract<T[number], AnyTable<typeof table.tb>>;
			return acc;
		},
		{} as MappedTables<T>,
	);

	const lookup = createLookupFromSchemas(tables);

	return new Orm(surreal, mapped, lookup);
}
