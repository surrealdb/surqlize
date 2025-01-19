import type Surreal from "surrealdb";
import { RecordId, type RecordIdValue } from "surrealdb";
import { SelectOneQuery, SelectQuery } from "../query/select";
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
