/**
 * DDL metadata carried alongside a field's type.
 *
 * Surqlize's type objects describe what a value *is*, which is everything the
 * query builder needs. Generating `DEFINE FIELD` needs more: constraints,
 * defaults, permissions and so on. That extra information lives here, attached
 * to the type but deliberately separate from it — nothing in this file affects
 * the inferred TypeScript type of a field.
 */

/** What SurrealDB should do to a record when the row it references is deleted. */
export type OnDeleteAction =
	| "CASCADE"
	| "SET NULL"
	| "SET DEFAULT"
	| "RESTRICT"
	| "IGNORE";

/** A `DEFAULT` clause, and whether it re-applies on update (`DEFAULT ALWAYS`). */
export interface FieldDefault {
	value: unknown;
	always: boolean;
}

/** A `REFERENCE` clause and its deletion behaviour. */
export interface FieldReference {
	/** The referenced table. Omitted for a bare `REFERENCE`. */
	table?: string;
	onDelete?: OnDeleteAction;
}

/**
 * Everything a field can carry beyond its type.
 *
 * Every property is optional; a field that has never been given a schema
 * modifier has an empty object here, and generates a bare `DEFINE FIELD`.
 */
export interface FieldDdl {
	/** `ASSERT` conditions, joined with `AND` when more than one is given. */
	assert?: string[];
	default?: FieldDefault;
	/** A `VALUE` expression, evaluated on write. */
	value?: string;
	/** A `VALUE { … }` expression, deferred until read. */
	computed?: string;
	readonly?: boolean;
	flexible?: boolean;
	permissions?: string;
	comment?: string;
	reference?: FieldReference;
	/** Previous names, used to migrate a rename instead of dropping the field. */
	previousNames?: string[];
}
