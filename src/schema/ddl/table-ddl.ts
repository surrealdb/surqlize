/**
 * DDL metadata carried alongside a table or edge schema.
 *
 * As with field-level metadata, none of this affects the inferred row type —
 * it exists so a migration can generate `DEFINE TABLE`.
 */

/** Per-operation permission rules. Each is a SurrealQL expression, or `FULL`/`NONE`. */
export interface TablePermissionRules {
	select?: string;
	create?: string;
	update?: string;
	delete?: string;
}

/** A `PERMISSIONS` clause: one rule for everything, or one per operation. */
export type TablePermissions = string | TablePermissionRules;

/** A `CHANGEFEED` clause. */
export interface TableChangefeed {
	duration: string;
	includeOriginal?: boolean;
}

/**
 * Everything a table can carry beyond its fields.
 *
 * Every property is optional. A table that has never been given a modifier
 * generates a bare `DEFINE TABLE <name> SCHEMAFULL`.
 *
 * Note the absence of rename tracking. Unlike fields, tables cannot be renamed
 * safely: record IDs embed the table name, so every inbound `record<old>` link
 * would be left dangling, and links held in `record<any>` fields, graph edges or
 * SCHEMALESS tables are invisible to a migration. Renaming a table is a manual
 * operation.
 */
export interface TableDdl {
	/** `SCHEMAFULL` when true, `SCHEMALESS` when false. Defaults to schemafull. */
	schemafull?: boolean;
	/** `DROP` — the table discards every record written to it. */
	drop?: boolean;
	permissions?: TablePermissions;
	changefeed?: TableChangefeed;
	/** An `AS SELECT …` clause, making this a computed view. */
	view?: string;
	comment?: string;
	/** `ENFORCED` — SurrealDB rejects edges whose `in`/`out` records do not exist. */
	enforced?: boolean;
}

/** Anything carrying table-level DDL metadata. */
export interface HasTableDdl {
	readonly ddl: Readonly<TableDdl>;
}

/**
 * Clone `schema`, applying `patch` to a copy of its DDL metadata.
 *
 * Cloning rather than mutating keeps a schema safe to share — the same table
 * definition is routinely passed to more than one `orm()` instance.
 */
export function patchTableDdl<S extends HasTableDdl>(
	schema: S,
	patch: (draft: TableDdl) => void,
): S {
	const next = Object.assign(
		Object.create(Object.getPrototypeOf(schema)),
		schema,
	) as S;
	const draft: TableDdl = { ...schema.ddl };
	patch(draft);
	(next as { ddl: TableDdl }).ddl = draft;
	return next;
}
