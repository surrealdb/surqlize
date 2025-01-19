import type Surreal from "surrealdb";
import { RecordId, type RecordIdValue } from "surrealdb";
import { SelectOneQuery, SelectQuery } from "../query/select";
import type { RecordType } from "../types";
import { type Workable, isWorkable } from "../utils";
import type { TableSchema } from "./table";

export type MappedTables<T extends TableSchema[]> = {
	[K in T[number]["tb"]]: Extract<T[number], TableSchema<K>>;
} & {};

export class Orm<T extends TableSchema[] = TableSchema[]> {
	constructor(
		public readonly surreal: Surreal,
		public readonly tables: MappedTables<T>,
	) {}

	// Multi
	select<Tb extends keyof this["tables"] & string>(
		tb: Tb,
	): SelectQuery<this, Tb>;

	// Single
	select<Tb extends keyof this["tables"] & string>(
		rid: RecordId<Tb>,
	): SelectOneQuery<this, Tb>;
	select<Tb extends keyof this["tables"] & string>(
		rid: Workable<RecordType<Tb>>,
	): SelectOneQuery<this, Tb>;
	select<Tb extends keyof this["tables"] & string>(
		tb: Tb,
		id: RecordIdValue,
	): SelectOneQuery<this, Tb>;

	select<Tb extends keyof this["tables"] & string>(
		tb: Tb | RecordId<Tb> | Workable<RecordType<Tb>>,
		id?: RecordIdValue,
	) {
		if (tb instanceof RecordId) return new SelectOneQuery(this, tb);
		if (isWorkable(tb)) return new SelectOneQuery(this, tb);
		if (id === undefined) return new SelectQuery(this, tb);
		return new SelectOneQuery(this, new RecordId(tb, id));
	}
}

export function orm<T extends TableSchema[]>(surreal: Surreal, ...tables: T) {
	const mapped = tables.reduce<MappedTables<T>>(
		(acc, table) => {
			const key = table.tb as T[number]["tb"];
			acc[key] = table as Extract<T[number], TableSchema<typeof table.tb>>;
			return acc;
		},
		{} as MappedTables<T>,
	);

	return new Orm(surreal, mapped);
}
