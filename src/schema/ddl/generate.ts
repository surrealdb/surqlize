import type { AbstractType, HasDefault } from "../../types/classes";
import type { Orm } from "../orm";
import {
	type DefinableSchema,
	type SchemaStatement,
	schemaStatements,
} from "./define";

export type { SchemaStatement, StatementKind } from "./define";

/** Something in the schema that has no `DEFINE` of its own, and why. */
export interface SkippedDefinition {
	/** Where it is, such as `user.posts`. */
	path: string;
	reason: string;
}

export interface SchemaOptions {
	/**
	 * Whether a statement replaces a definition that exists (`overwrite`, the
	 * default) or leaves it (`if-not-exists`).
	 */
	mode?: "overwrite" | "if-not-exists";
}

/** The result of {@link generateSchema}. */
export interface GeneratedSchema {
	/** Every table before its fields, so the output can be run top to bottom. */
	statements: SchemaStatement[];
	/** What the schema holds that is left to the client, and why. */
	skipped: SkippedDefinition[];
}

/**
 * Generate the statements for every table and edge of an ORM, with computed
 * fields, so the database enforces what the types describe.
 *
 * Nothing is guessed: what cannot be expressed in SurrealQL (a default that is a
 * function) is listed in `skipped` with its path and the reason, and left to the
 * client.
 *
 * @example
 * ```ts
 * const { statements } = generateSchema(db);
 * await surreal.query(statements.map((s) => s.sql).join("\n"));
 * ```
 */
export function generateSchema(
	// biome-ignore lint/suspicious/noExplicitAny: accepts an ORM over any tables
	orm: Orm<any>,
	options: SchemaOptions = {},
): GeneratedSchema {
	const overwrite = options.mode !== "if-not-exists";
	const statements: SchemaStatement[] = [];
	const skipped: SkippedDefinition[] = [];

	for (const schema of Object.values(orm.tables) as DefinableSchema[]) {
		statements.push(
			...schemaStatements(schema, { overwrite: true }).map((s) =>
				retarget(s, overwrite),
			),
		);
		statements.push(...computedStatements(orm, schema, overwrite));
		skip(schema, skipped);
	}
	return { statements, skipped };
}

/** `OVERWRITE` is what the statements carry; `if-not-exists` swaps it. */
function retarget(
	statement: SchemaStatement,
	overwrite: boolean,
): SchemaStatement {
	return overwrite
		? statement
		: {
				...statement,
				sql: statement.sql.replace(" OVERWRITE ", " IF NOT EXISTS "),
			};
}

function computedStatements(
	// biome-ignore lint/suspicious/noExplicitAny: accepts an ORM over any tables
	orm: Orm<any>,
	schema: DefinableSchema,
	overwrite: boolean,
): SchemaStatement[] {
	if (!("computedStatements" in schema)) return [];
	return schema.computedStatements(orm).map((sql) => ({
		kind: "field" as const,
		name: `${schema.tb}.${sql.match(/FIELD (?:OVERWRITE|IF NOT EXISTS) (\S+) ON/)?.[1] ?? "?"}`,
		sql: `${overwrite ? sql : sql.replace("OVERWRITE", "IF NOT EXISTS")};`,
	}));
}

/** Record what a table declares that its statements leave out. */
function skip(schema: DefinableSchema, into: SkippedDefinition[]): void {
	const computed = new Set<string>(
		"computedFields" in schema ? schema.computedFields : [],
	);
	for (const [name, type] of Object.entries(
		schema._fields as Record<string, AbstractType>,
	)) {
		if (computed.has(name)) continue;
		const fn = (type as Partial<HasDefault>)._default;
		if (typeof fn === "function") {
			into.push({
				path: `${schema.tb}.${name}`,
				reason:
					"its default is a function, which only the client can run; use a value or expr()",
			});
		}
	}
}

/** The statements as the text of a `.surql` file, one per line. */
export function toSurql(schema: GeneratedSchema): string {
	return `${schema.statements.map((s) => s.sql).join("\n")}\n`;
}
