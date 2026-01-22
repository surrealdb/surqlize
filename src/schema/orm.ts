import type { Surreal } from "surrealdb";
import { RecordId, type RecordIdValue } from "surrealdb";
import { CreateQuery } from "../query/create";
import { DeleteQuery } from "../query/delete";
import { InsertQuery } from "../query/insert";
import { RelateQuery } from "../query/relate";
import { SelectQuery } from "../query/select";
import { UpdateQuery } from "../query/update";
import { UpsertQuery } from "../query/upsert";
import type { ArrayType, RecordType } from "../types";
import { type Workable, type WorkableContext, isWorkable } from "../utils";
import { EdgeSchema } from "./edge";
import { type CreateSchemaLookup, createLookupFromSchemas } from "./lookup";
import type { TableSchema } from "./table";

export type AnyTable<Tb extends string = string> =
	| TableSchema<Tb>
	| EdgeSchema<string, Tb>;

export type MappedTables<T extends AnyTable[]> = {
	[K in T[number]["tb"]]: Extract<T[number], AnyTable<K>>;
} & {};

export class Orm<T extends AnyTable[] = AnyTable[]> {
	constructor(
		public readonly surreal: Surreal,
		public readonly tables: MappedTables<T>,
		public readonly lookup: CreateSchemaLookup<T>,
	) {}

	// Table
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

	// CREATE - single table
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
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, id?: RecordIdValue) {
		return new CreateQuery(this, tb, id?.toString());
	}

	// INSERT with data (object style)
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
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, data?: unknown | unknown[]) {
		return new InsertQuery(this, tb, data);
	}

	// UPDATE - table
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

	// DELETE - table
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

	// UPSERT - table
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

	// RELATE
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
}

export function orm<T extends AnyTable[]>(surreal: Surreal, ...tables: T) {
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
