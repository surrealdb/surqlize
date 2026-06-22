import type { SurrealSession } from "surrealdb";
import { RecordId, type RecordIdValue, Uuid } from "surrealdb";
import { OrmError } from "../error";
import type { Query } from "../query/abstract";
import { ApiClient } from "../query/api";
import { BatchQuery } from "../query/batch";
import { CreateQuery } from "../query/create";
import { DeleteQuery } from "../query/delete";
import { InsertQuery } from "../query/insert";
import { LiveQuery } from "../query/live";
import { RelateQuery } from "../query/relate";
import { SelectQuery } from "../query/select";
import type { Transaction } from "../query/transaction";
import { UpdateQuery } from "../query/update";
import { UpsertQuery } from "../query/upsert";
import {
	type AbstractType,
	type ArrayType,
	type BoolType,
	type DateType,
	type GraphType,
	type NeverType,
	type NoneType,
	type NullType,
	type NumberType,
	type ObjectType,
	type RecordType,
	type StringType,
	t,
	type UuidType,
} from "../types";
import {
	__type,
	intoWorkable,
	isWorkable,
	type Workable,
	type WorkableContext,
} from "../utils";
import { type Actionable, actionable } from "../utils/actionable";
import type { ApiEndpointSchema } from "./api";
import { EdgeSchema } from "./edge";
import type { FunctionCallable, InferParams } from "./function";
import { type CreateSchemaLookup, createLookupFromSchemas } from "./lookup";
import { TableSchema } from "./table";

/** Union type representing any table or edge schema. */
export type AnyTable<Tb extends string = string> =
	| TableSchema<Tb>
	| EdgeSchema<string, Tb>;

/** Maps an array of table/edge schemas to a record keyed by table name. */
export type MappedTables<T extends AnyTable[]> = {
	[K in T[number]["tb"]]: Extract<T[number], AnyTable<K>>;
} & {};

/**
 * A plain object grouping table/edge schemas under arbitrary keys, e.g. the
 * result of `import * as schema from "./schema"`. The object keys are only a
 * container — tables are still addressed by their `tb` name in queries.
 */
export type SchemaMap = Record<string, AnyTable>;

// Convert the union of a schema map's values into a tuple so the object form of
// `orm()` resolves to exactly the same `Orm<[...]>` type as the rest-param form.
// Element order is irrelevant: every consumer (`MappedTables`, the lookup
// helpers, `HasEdgeSchema`) inspects the tuple via `[number]` or a membership
// check — none depend on ordering.
type UnionToIntersection<U> = (
	U extends unknown
		? (k: U) => void
		: never
) extends (k: infer I) => void
	? I
	: never;

type LastOf<U> =
	UnionToIntersection<U extends unknown ? () => U : never> extends () => infer R
		? R
		: never;

type UnionToTuple<U> = [U] extends [never]
	? []
	: [...UnionToTuple<Exclude<U, LastOf<U>>>, LastOf<U>];

/** The schemas held by a {@link SchemaMap}, as a tuple used as the `Orm` type argument. */
export type SchemaMapTables<S extends SchemaMap> =
	UnionToTuple<S[keyof S]> extends infer R extends AnyTable[] ? R : never;

type ValueTupleTypes<V extends readonly unknown[]> = {
	-readonly [K in keyof V]: ValueType<V[K]>;
};

type ValueArrayType<V extends readonly unknown[]> = V extends readonly []
	? ArrayType<NeverType>
	: number extends V["length"]
		? ArrayType<ValueType<V[number]>>
		: ValueTupleTypes<V> extends infer T extends AbstractType[]
			? ArrayType<T>
			: never;

type ValueObjectFields<V extends Record<string, unknown>> = {
	[K in keyof V & string]: ValueType<V[K]>;
};

export type ValueType<V> =
	V extends Workable<WorkableContext, infer T>
		? T
		: V extends RecordId<infer Tb>
			? RecordType<Tb>
			: V extends string
				? StringType
				: V extends number
					? NumberType
					: V extends boolean
						? BoolType
						: V extends Date
							? DateType
							: V extends Uuid
								? UuidType
								: V extends null
									? NullType
									: V extends undefined
										? NoneType
										: V extends readonly unknown[]
											? ValueArrayType<V>
											: V extends Record<string, unknown>
												? ObjectType<ValueObjectFields<V>>
												: AbstractType;

function typeFromValue(value: unknown): AbstractType {
	if (isWorkable(value)) return value[__type];
	if (value instanceof RecordId) return t.record(String(value.table));
	if (value instanceof Date) return t.date();
	if (value instanceof Uuid) return t.uuid();
	if (value === null) return t.null();
	if (value === undefined) return t.none();

	switch (typeof value) {
		case "string":
			return t.string();
		case "number":
			return t.number();
		case "boolean":
			return t.bool();
		case "object": {
			if (Array.isArray(value)) {
				if (value.length === 0) return t.array(t.never());
				return t.array(value.map(typeFromValue) as AbstractType[]);
			}

			const fields = Object.fromEntries(
				Object.entries(value).map(([key, field]) => [
					key,
					typeFromValue(field),
				]),
			) as Record<string, AbstractType>;
			return t.object(fields);
		}
		default:
			throw new OrmError(`Cannot infer a SurrealDB type for ${typeof value}`);
	}
}

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
	 * Wrap a raw JavaScript value as an actionable SurrealQL expression. Record
	 * ids keep their table type, so graph traversal can start directly from a
	 * value: `db.value(new RecordId("person", "tobie")).out("authored")`.
	 */
	value<const V>(value: V): Actionable<WorkableContext<this>, ValueType<V>> {
		const ctx = {
			orm: this,
			id: Symbol(),
		} as WorkableContext<this>;
		return actionable(
			intoWorkable(
				ctx,
				typeFromValue(value) as ValueType<V>,
				value as ValueType<V>["infer"],
			),
		);
	}

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

	// Multiple tables — a heterogeneous select whose rows are the merged schema
	// of every named table (`SELECT … FROM user, company`).
	select<
		C extends WorkableContext<this>,
		const Tb extends keyof this["tables"] & string,
	>(tbs: readonly Tb[]): SelectQuery<this, C, Tb>;

	// RecordId
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: RecordId<Tb>): SelectQuery<this, C, Tb>;
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: Workable<C, RecordType<Tb>>): SelectQuery<this, C, Tb>;
	// Graph-traversal step (e.g. `user.out("authored")`)
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(step: Workable<C, GraphType<Tb>>): SelectQuery<this, C, Tb>;
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, id: RecordIdValue): SelectQuery<this, C, Tb>;

	// Method
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(
		tb:
			| Tb
			| readonly Tb[]
			| RecordId<Tb>
			| Workable<C, RecordType<Tb> | GraphType<Tb>>,
		id?: RecordIdValue,
	) {
		if (tb instanceof RecordId) return new SelectQuery(this, tb);
		if (Array.isArray(tb)) return new SelectQuery(this, tb as readonly Tb[]);
		if (isWorkable(tb))
			return new SelectQuery(this, tb as Workable<C, RecordType<Tb>>);
		if (id === undefined) return new SelectQuery(this, tb as Tb);
		return new SelectQuery(this, new RecordId(tb as Tb, id));
	}

	/**
	 * Open a `LIVE SELECT` subscription for a table, record ID, or workable
	 * record reference. Awaiting the returned builder runs the live query and
	 * resolves to a {@link LiveSubscription}.
	 *
	 * @param tb - A table name, `RecordId`, workable record, or table name with a second `id` argument.
	 * @returns A {@link LiveQuery} that can be chained (`.where()`, `.return()`, `.fetch()`, `.diff()`) and awaited.
	 *
	 * @remarks Filtering or projecting a live query relies on query parameters,
	 *   which require **SurrealDB ≥ 3.0**.
	 */
	live<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb): LiveQuery<this, C, Tb>;

	// RecordId
	live<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: RecordId<Tb>): LiveQuery<this, C, Tb>;
	live<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: Workable<C, RecordType<Tb>>): LiveQuery<this, C, Tb>;
	live<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, id: RecordIdValue): LiveQuery<this, C, Tb>;

	// Method
	live<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb | RecordId<Tb> | Workable<C, RecordType<Tb>>, id?: RecordIdValue) {
		if (tb instanceof RecordId) return new LiveQuery(this, tb);
		if (isWorkable(tb))
			return new LiveQuery(this, tb as Workable<C, RecordType<Tb>>);
		if (id === undefined) return new LiveQuery(this, tb as Tb);
		return new LiveQuery(this, new RecordId(tb as Tb, id));
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
		return new CreateQuery(this, tb, id);
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
	 * @throws {OrmError} If `edge` does not refer to an {@link EdgeSchema}.
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
			throw new OrmError(`"${edge}" is not an edge table`);
		}

		return new RelateQuery(this, edge, from, to);
	}

	/**
	 * Run a user-defined SurrealDB function and return the typed result.
	 *
	 * @param fn - A function callable created with {@link fn}.
	 * @param args - Positional arguments matching the function's parameter types.
	 *   Omit for functions that take no parameters.
	 * @returns The typed result of the function execution.
	 *
	 * @example
	 * ```ts
	 * const greet = fn("greet", [t.string()], t.string());
	 * const result = await db.run(greet, ["world"]); // typed as string
	 * ```
	 */
	async run<P extends AbstractType[], R extends AbstractType>(
		fn: FunctionCallable<P, R>,
		args?: InferParams<P>,
	): Promise<R["infer"]> {
		const schema = fn.schema;
		const result = await this.surreal.run(
			`fn::${schema.name}`,
			args as unknown[] | undefined,
		);
		return schema.returns.parse(result);
	}

	/**
	 * Create a type-safe API client for user-defined API endpoints.
	 *
	 * @param endpoints - One or more {@link ApiEndpointSchema} definitions
	 *   created with {@link api}.
	 * @returns An {@link ApiClient} with typed HTTP methods.
	 *
	 * @example
	 * ```ts
	 * const usersEndpoint = api("/users", {
	 *   get: { response: t.array(user.schema) },
	 *   post: { request: t.object({ name: t.string() }), response: user.schema },
	 * });
	 *
	 * const client = db.api(usersEndpoint);
	 * const response = await client.get("/users");
	 * ```
	 */
	api<E extends ApiEndpointSchema[]>(...endpoints: E) {
		return new ApiClient(this.surreal, endpoints);
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
 * Distinguish a {@link SchemaMap} from an individual table/edge schema. A single
 * schema is an instance of {@link TableSchema} or {@link EdgeSchema}; a schema map
 * is any other (plain) object.
 */
function isSchemaMap(value: unknown): value is SchemaMap {
	return (
		typeof value === "object" &&
		value !== null &&
		!(value instanceof TableSchema) &&
		!(value instanceof EdgeSchema)
	);
}

/**
 * Create an ORM instance bound to a SurrealDB session and a set of table/edge
 * schemas. This is the main entry point for building type-safe queries.
 *
 * Schemas may be passed either as individual arguments or grouped in a single
 * object — both produce an identical, fully typed ORM. Tables are always
 * addressed by their `tb` name in queries, regardless of how they are passed.
 *
 * @param surreal - An active SurrealDB session.
 * @param tables - One or more {@link TableSchema} or {@link EdgeSchema} definitions.
 * @returns An {@link Orm} instance with query builders scoped to the provided schemas.
 *
 * @example Individual arguments
 * ```ts
 * const db = orm(new Surreal(), user, post, authored);
 * const users = await db.select("user");
 * ```
 *
 * @example A schema object (handy with `import * as schema`)
 * ```ts
 * // database/schema.ts
 * export const user = table("user", { name: t.string() });
 * export const post = table("post", { title: t.string() });
 *
 * // src/db.ts
 * import * as schema from "../database/schema";
 * const db = orm(new Surreal(), schema);
 * const users = await db.select("user");
 * ```
 */
export function orm<T extends AnyTable[]>(
	surreal: SurrealSession,
	...tables: T
): Orm<T>;
export function orm<S extends SchemaMap>(
	surreal: SurrealSession,
	schema: S,
): Orm<SchemaMapTables<S>>;
export function orm(
	surreal: SurrealSession,
	...args: AnyTable[] | [SchemaMap]
): Orm {
	const tables: AnyTable[] =
		args.length === 1 && isSchemaMap(args[0])
			? Object.values(args[0])
			: (args as AnyTable[]);

	const mapped = tables.reduce<Record<string, AnyTable>>((acc, table) => {
		acc[table.tb] = table;
		return acc;
	}, {});

	const lookup = createLookupFromSchemas(tables);

	return new Orm(surreal, mapped as MappedTables<AnyTable[]>, lookup);
}
