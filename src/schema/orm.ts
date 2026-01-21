import type Surreal from "surrealdb";
import { RecordId, type RecordIdValue } from "surrealdb";
import { CreateQuery } from "../query/create";
import { DeleteOneQuery, DeleteQuery } from "../query/delete";
import { InsertQuery } from "../query/insert";
import { SelectOneQuery, SelectQuery } from "../query/select";
import { UpdateOneQuery, UpdateQuery } from "../query/update";
import { UpsertOneQuery, UpsertQuery } from "../query/upsert";
import type { RecordType } from "../types";
import { type Workable, type WorkableContext, isWorkable } from "../utils";
import type { EdgeSchema } from "./edge";
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

	// Multi
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb): SelectQuery<this, C, Tb>;

	// Single
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: RecordId<Tb>): SelectOneQuery<this, C, Tb>;
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: Workable<C, RecordType<Tb>>): SelectOneQuery<this, C, Tb>;
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, id: RecordIdValue): SelectOneQuery<this, C, Tb>;

	// Method
	select<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb | RecordId<Tb> | Workable<C, RecordType<Tb>>, id?: RecordIdValue) {
		if (tb instanceof RecordId) return new SelectOneQuery(this, tb);
		if (isWorkable(tb))
			return new SelectOneQuery(this, tb as Workable<C, RecordType<Tb>>);
		if (id === undefined) return new SelectQuery(this, tb as Tb);
		return new SelectOneQuery(this, new RecordId(tb as Tb, id));
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
		return new CreateQuery(this, tb, id);
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

	// UPDATE - bulk
	update<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb): UpdateQuery<this, C, Tb>;

	// UPDATE - single record (3 overloads like SELECT)
	update<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: RecordId<Tb>): UpdateOneQuery<this, C, Tb>;
	update<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: Workable<C, RecordType<Tb>>): UpdateOneQuery<this, C, Tb>;
	update<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, id: RecordIdValue): UpdateOneQuery<this, C, Tb>;

	// Method
	update<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb | RecordId<Tb> | Workable<C, RecordType<Tb>>, id?: RecordIdValue) {
		if (tb instanceof RecordId) return new UpdateOneQuery(this, tb);
		if (isWorkable(tb))
			return new UpdateOneQuery(this, tb as Workable<C, RecordType<Tb>>);
		if (id === undefined) return new UpdateQuery(this, tb as Tb);
		return new UpdateOneQuery(this, new RecordId(tb as Tb, id));
	}

	// DELETE - bulk
	delete<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb): DeleteQuery<this, C, Tb>;

	// DELETE - single record (3 overloads like SELECT)
	delete<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: RecordId<Tb>): DeleteOneQuery<this, C, Tb>;
	delete<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: Workable<C, RecordType<Tb>>): DeleteOneQuery<this, C, Tb>;
	delete<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, id: RecordIdValue): DeleteOneQuery<this, C, Tb>;

	// Method
	delete<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb | RecordId<Tb> | Workable<C, RecordType<Tb>>, id?: RecordIdValue) {
		if (tb instanceof RecordId) return new DeleteOneQuery(this, tb);
		if (isWorkable(tb))
			return new DeleteOneQuery(this, tb as Workable<C, RecordType<Tb>>);
		if (id === undefined) return new DeleteQuery(this, tb as Tb);
		return new DeleteOneQuery(this, new RecordId(tb as Tb, id));
	}

	// UPSERT - bulk
	upsert<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb): UpsertQuery<this, C, Tb>;

	// UPSERT - single record (3 overloads like SELECT)
	upsert<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: RecordId<Tb>): UpsertOneQuery<this, C, Tb>;
	upsert<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(rid: Workable<C, RecordType<Tb>>): UpsertOneQuery<this, C, Tb>;
	upsert<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb, id: RecordIdValue): UpsertOneQuery<this, C, Tb>;

	// Method
	upsert<
		C extends WorkableContext<this>,
		Tb extends keyof this["tables"] & string,
	>(tb: Tb | RecordId<Tb> | Workable<C, RecordType<Tb>>, id?: RecordIdValue) {
		if (tb instanceof RecordId) return new UpsertOneQuery(this, tb);
		if (isWorkable(tb))
			return new UpsertOneQuery(this, tb as Workable<C, RecordType<Tb>>);
		if (id === undefined) return new UpsertQuery(this, tb as Tb);
		return new UpsertOneQuery(this, new RecordId(tb as Tb, id));
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
