import {
	type AbstractType,
	type ObjectType,
	type RecordType,
	t,
} from "../types";

/** A record mapping field names (excluding `id`) to their type definitions. */
export type TableFields = Record<Exclude<string, "id">, AbstractType>;

type GetSchemaType<Tb extends string, Fd extends TableFields> = ObjectType<
	Fd & { id: RecordType<Tb> }
>;

type GetInferType<Tb extends string, Fd extends TableFields> = GetSchemaType<
	Tb,
	Fd
>["infer"];

/**
 * Schema definition for a SurrealDB table. Automatically includes a typed `id`
 * field based on the table name. Use the {@link table} factory function to
 * create instances.
 *
 * @typeParam Tb - The table name literal type.
 * @typeParam Fd - The user-defined fields for the table.
 */
export class TableSchema<
	Tb extends string = string,
	Fd extends TableFields = TableFields,
> {
	constructor(
		public readonly tb: Tb,
		public readonly _fields: Fd,
	) {}

	get fields(): Fd & { id: RecordType<Tb> } & {} {
		return {
			...this._fields,
			id: t.record(this.tb as string),
		} as Fd & { id: RecordType<Tb> } & {};
	}

	type = undefined as unknown as GetInferType<Tb, Fd>;

	get schema(): GetSchemaType<Tb, Fd> {
		return t.object(this.fields);
	}

	/** Type-guard that checks whether a value matches this table's schema. */
	validate(value: unknown): value is GetInferType<Tb, Fd> {
		return this.schema.validate(value);
	}
}

/**
 * Define a SurrealDB table schema. An `id` field of type `RecordType<Tb>` is
 * automatically added.
 *
 * @param tb - The table name.
 * @param fields - A record of field names to type definitions.
 * @returns A {@link TableSchema} instance.
 *
 * @example
 * ```ts
 * const user = table("user", {
 *   name: t.string(),
 *   age: t.number(),
 *   email: t.string(),
 * });
 * ```
 */
export function table<
	Tb extends string,
	Fd extends Record<Exclude<string, "id">, AbstractType>,
>(tb: Tb extends string ? Tb : never, fields: Fd) {
	return new TableSchema(tb, fields);
}
