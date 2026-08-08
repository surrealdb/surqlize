import {
	type AbstractType,
	type ObjectType,
	type RecordType,
	t,
} from "../types";
import type { EventOptions } from "./ddl/event-ddl";
import type { IndexOptions } from "./ddl/index-ddl";
import {
	patchTableDdl,
	type TableDdl,
	type TablePermissions,
} from "./ddl/table-ddl";

/** A record mapping field names to their type definitions. */
export type TableFields = Record<string, AbstractType>;

/**
 * The table's fields with `id` filled in.
 *
 * SurrealDB gives every record an `id`, so one is injected when the schema does
 * not declare it. A schema that *does* declare `id` keeps its own — useful when
 * the table generates ids itself, e.g.
 * `id: t.uuid().default("rand::uuid::v7()").readonly()`.
 */
type WithId<Tb extends string, Fd extends TableFields> = "id" extends keyof Fd
	? Fd
	: Fd & { id: RecordType<Tb> };

type GetSchemaType<Tb extends string, Fd extends TableFields> = ObjectType<
	WithId<Tb, Fd>
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

	/** Schema metadata used to generate `DEFINE TABLE`. */
	readonly ddl: Readonly<TableDdl> = {};

	get fields(): WithId<Tb, Fd> & {} {
		// The injected `id` comes first so a schema that declares its own wins.
		return {
			id: t.record(this.tb as string),
			...this._fields,
		} as WithId<Tb, Fd> & {};
	}

	type = undefined as unknown as GetInferType<Tb, Fd>;

	get schema(): GetSchemaType<Tb, Fd> {
		return t.object(this.fields);
	}

	/** Type-guard that checks whether a value matches this table's schema. */
	validate(value: unknown): value is GetInferType<Tb, Fd> {
		return this.schema.validate(value);
	}

	// -------------------------------------------------------------------------
	// Schema modifiers
	//
	// As with the field modifiers, each returns a clone rather than mutating —
	// a table definition is routinely shared between several `orm()` instances.
	// -------------------------------------------------------------------------

	/** Enforce the declared fields, rejecting anything else. This is the default. */
	schemafull(): this {
		return patchTableDdl(this, (d) => {
			d.schemafull = true;
		});
	}

	/** Allow fields beyond those declared. */
	schemaless(): this {
		return patchTableDdl(this, (d) => {
			d.schemafull = false;
		});
	}

	/** Discard every record written to this table (`DROP`). */
	drop(): this {
		return patchTableDdl(this, (d) => {
			d.drop = true;
		});
	}

	/** Set the table's `PERMISSIONS`, either one rule or one per operation. */
	permissions(rules: TablePermissions): this {
		return patchTableDdl(this, (d) => {
			d.permissions = rules;
		});
	}

	/** Retain a change feed for `duration` (e.g. `"3d"`). */
	changefeed(duration: string, includeOriginal = false): this {
		return patchTableDdl(this, (d) => {
			d.changefeed = { duration, includeOriginal };
		});
	}

	/** Make this a computed view over another table (`AS SELECT …`). */
	view(selectStatement: string): this {
		return patchTableDdl(this, (d) => {
			d.view = selectStatement;
		});
	}

	/** Attach a `COMMENT` to the table. */
	comment(text: string): this {
		return patchTableDdl(this, (d) => {
			d.comment = text;
		});
	}

	/**
	 * Add an index.
	 *
	 * @param name - The index name
	 * @param options - What to index and how
	 */
	index(name: string, options: IndexOptions): this {
		return patchTableDdl(this, (d) => {
			d.indexes = { ...d.indexes, [name]: options };
		});
	}

	/**
	 * Add an event.
	 *
	 * @param name - The event name
	 * @param options - What fires it and what it does
	 */
	event(name: string, options: EventOptions): this {
		return patchTableDdl(this, (d) => {
			d.events = { ...d.events, [name]: options };
		});
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
