import type { SurrealSession } from "surrealdb";
import type { EntityKind } from "../schema/ddl/entities";

/** A table as the database currently has it, with its definitions verbatim. */
export interface CurrentTable {
	name: string;
	/** The `DEFINE TABLE` statement SurrealDB reports. */
	definition: string;
	/** Each field's `DEFINE FIELD` statement, keyed by field path. */
	fields: Record<string, string>;
	/** Each index's `DEFINE INDEX` statement, keyed by index name. */
	indexes: Record<string, string>;
	/** Each event's `DEFINE EVENT` statement, keyed by event name. */
	events: Record<string, string>;
}

/** The database's current schema, as statements rather than parsed structures. */
export interface CurrentSchema {
	tables: Record<string, CurrentTable>;
	/** Database-level definitions, keyed by kind and then by name. */
	entities: Record<EntityKind, Record<string, string>>;
}

/** The shape `INFO FOR DB` returns. */
interface DbInfo {
	tables?: Record<string, string>;
	analyzers?: Record<string, string>;
	params?: Record<string, string>;
	functions?: Record<string, string>;
	sequences?: Record<string, string>;
	accesses?: Record<string, string>;
}

/** Which `INFO FOR DB` key holds each kind of definition. */
const ENTITY_KEYS: Record<EntityKind, keyof DbInfo> = {
	analyzer: "analyzers",
	param: "params",
	function: "functions",
	sequence: "sequences",
	access: "accesses",
};

/** The shape `INFO FOR TABLE` returns. */
interface TableInfo {
	fields?: Record<string, string>;
	indexes?: Record<string, string>;
	events?: Record<string, string>;
}

/**
 * The table migrations are recorded in. Excluded from introspection so it never
 * shows up as drift against a schema that does not declare it.
 */
export const MIGRATIONS_TABLE = "_migrations";

/**
 * Read the database's current schema.
 *
 * Definitions are kept as the statements SurrealDB reports rather than being
 * parsed into properties. Comparison happens through {@link canonicalise}, so
 * there is nothing to gain from taking them apart — and a parser would be one
 * more thing to keep in step with SurrealDB's output.
 *
 * @param surreal - A session already pointed at the target namespace and database
 * @returns Every table, with its fields, indexes and events
 */
export async function introspect(
	surreal: SurrealSession,
): Promise<CurrentSchema> {
	const [dbInfo] = await surreal.query<[DbInfo]>("INFO FOR DB;");
	const tableNames = Object.keys(dbInfo?.tables ?? {}).filter(
		(name) => name !== MIGRATIONS_TABLE,
	);

	const tables: Record<string, CurrentTable> = {};

	for (const name of tableNames) {
		const [info] = await surreal.query<[TableInfo]>(`INFO FOR TABLE ${name};`);

		tables[name] = {
			name,
			definition: dbInfo?.tables?.[name] ?? "",
			fields: info?.fields ?? {},
			indexes: info?.indexes ?? {},
			events: info?.events ?? {},
		};
	}

	const entities = {} as CurrentSchema["entities"];
	for (const [kind, key] of Object.entries(ENTITY_KEYS)) {
		entities[kind as EntityKind] =
			(dbInfo?.[key] as Record<string, string>) ?? {};
	}

	return { tables, entities };
}
