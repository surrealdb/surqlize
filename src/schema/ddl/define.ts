import { EdgeSchema } from "../edge";
import type { TableSchema } from "../table";
import { defineEvent } from "./event-ddl";
import { type FlatField, flattenFields } from "./flatten";
import { defineIndex } from "./index-ddl";
import { printSurqlType } from "./print-type";
import type { TableDdl, TablePermissions } from "./table-ddl";

/** Anything that can be rendered as a `DEFINE TABLE` plus its fields. */
export type DefinableSchema = TableSchema | EdgeSchema;

/** How a `DEFINE` statement should behave when the thing already exists. */
export interface DefineOptions {
	/** Replace an existing definition rather than erroring. */
	overwrite?: boolean;
}

/**
 * Render a `DEFINE FIELD` statement.
 *
 * Clause order follows SurrealQL's grammar, which is not free-form — a
 * misplaced clause is a parse error.
 *
 * @param tableName - The table the field belongs to
 * @param field - The field's path, type and metadata
 * @returns A complete `DEFINE FIELD` statement
 */
export function defineField(
	tableName: string,
	field: FlatField,
	options: DefineOptions = {},
): string {
	const parts = ["DEFINE FIELD"];
	// SurrealDB errors with "The field 'x' already exists" rather than replacing,
	// so changing a field means redefining it with OVERWRITE.
	if (options.overwrite) parts.push("OVERWRITE");
	parts.push(field.name, "ON TABLE", tableName);
	const ddl = field.ddl;

	// FLEXIBLE follows the type — SurrealDB rejects it before with
	// "FLEXIBLE must be specified after TYPE".
	parts.push("TYPE", printSurqlType(field.type));
	if (ddl.flexible) parts.push("FLEXIBLE");

	if (ddl.default !== undefined) {
		parts.push(
			ddl.default.always ? "DEFAULT ALWAYS" : "DEFAULT",
			literal(ddl.default.value),
		);
	}

	// SurrealDB stores both as VALUE; the braced form defers evaluation.
	if (ddl.value !== undefined) parts.push("VALUE", ddl.value);
	if (ddl.computed !== undefined) parts.push("VALUE", `{ ${ddl.computed} }`);

	if (ddl.readonly) parts.push("READONLY");

	if (ddl.reference) {
		parts.push("REFERENCE");
		if (ddl.reference.onDelete) {
			parts.push("ON DELETE", ddl.reference.onDelete);
		}
	}

	// Several asserts combine into one clause.
	if (ddl.assert?.length) {
		parts.push("ASSERT", joinAsserts(ddl.assert));
	}

	if (ddl.permissions) parts.push("PERMISSIONS", ddl.permissions);
	if (ddl.comment) parts.push("COMMENT", quote(ddl.comment, "'"));

	return `${parts.join(" ")};`;
}

/**
 * Render a `DEFINE TABLE` statement.
 *
 * @param schema - The table or edge to define
 * @returns A complete `DEFINE TABLE` statement
 */
export function defineTable(
	schema: DefinableSchema,
	options: DefineOptions = {},
): string {
	const ddl: Readonly<TableDdl> = schema.ddl;
	const parts = ["DEFINE TABLE"];
	if (options.overwrite) parts.push("OVERWRITE");
	parts.push(schema.tb);

	if (schema instanceof EdgeSchema) {
		parts.push(
			"TYPE RELATION IN",
			tableList(schema.from),
			"OUT",
			tableList(schema.to),
		);
		if (ddl.enforced) parts.push("ENFORCED");
	} else {
		parts.push("TYPE NORMAL");
	}

	if (ddl.drop) parts.push("DROP");

	// Schemafull unless explicitly opted out of.
	parts.push(ddl.schemafull === false ? "SCHEMALESS" : "SCHEMAFULL");

	if (ddl.view) parts.push("AS", ddl.view);

	if (ddl.changefeed) {
		parts.push("CHANGEFEED", ddl.changefeed.duration);
		if (ddl.changefeed.includeOriginal) parts.push("INCLUDE ORIGINAL");
	}

	if (ddl.permissions) parts.push(permissions(ddl.permissions));
	if (ddl.comment) parts.push("COMMENT", quote(ddl.comment, "'"));

	return `${parts.join(" ")};`;
}

/**
 * Render every statement needed to define a table and its fields.
 *
 * @param schema - The table or edge to define
 * @returns The `DEFINE TABLE` statement followed by one per field
 */
export function defineSchema(
	schema: DefinableSchema,
	options: DefineOptions = {},
): string[] {
	const statements = [defineTable(schema, options)];
	const declared = schema._fields;

	for (const field of flattenFields(schema.fields)) {
		if (isManagedBySurrealDB(schema, field.name, declared)) continue;
		statements.push(defineField(schema.tb, field, options));
	}

	// Indexes follow the fields they cover.
	for (const [name, index] of Object.entries(schema.ddl.indexes ?? {})) {
		statements.push(defineIndex(schema.tb, { name, ...index }, options));
	}

	for (const [name, event] of Object.entries(schema.ddl.events ?? {})) {
		statements.push(defineEvent(schema.tb, { name, ...event }, options));
	}

	return statements;
}

/**
 * Whether SurrealDB owns this field and it must not be defined.
 *
 * `id` is injected into every schema as `record<tb>` so a row type has one, but
 * that is a TypeScript convenience: SurrealDB manages `id` itself and rejects
 * `DEFINE FIELD id … TYPE record<tb>` outright ("not a valid record id key").
 * An `id` the schema *declares* is a different matter — a table generating its
 * own ids needs it — so that one is emitted.
 *
 * `in` and `out` come from `TYPE RELATION` and are never emitted.
 */
function isManagedBySurrealDB(
	schema: DefinableSchema,
	fieldName: string,
	declared: Record<string, unknown>,
): boolean {
	if (
		schema instanceof EdgeSchema &&
		(fieldName === "in" || fieldName === "out")
	) {
		return true;
	}
	return fieldName === "id" && !("id" in declared);
}

/**
 * Combine several `ASSERT` conditions into one clause.
 *
 * `AND` binds tighter than `OR`, so a condition containing a top-level `OR`
 * must be parenthesised or joining would silently change its meaning. Anything
 * else is left bare: SurrealDB drops redundant parentheses when it stores a
 * definition, and emitting them would make the field look permanently modified.
 */
function joinAsserts(conditions: string[]): string {
	if (conditions.length === 1) return conditions[0] as string;
	return conditions.map((c) => (hasTopLevelOr(c) ? `(${c})` : c)).join(" AND ");
}

/** Whether `condition` contains an `OR` outside any parentheses or quotes. */
function hasTopLevelOr(condition: string): boolean {
	return maskNested(condition).search(/\bOR\b/i) !== -1;
}

/**
 * Blank out everything inside quotes or parentheses.
 *
 * Replacing rather than removing keeps offsets intact, so a word boundary either
 * side of the remaining text still means what it did in the original.
 */
function maskNested(input: string): string {
	// Blank quoted runs first, so a bracket inside a string cannot shift depth.
	const unquoted = input.replace(/'[^']*'|"[^"]*"/g, (match) =>
		" ".repeat(match.length),
	);

	const out: string[] = [];
	let depth = 0;

	for (const char of unquoted) {
		if (char === "(") depth += 1;
		else if (char === ")") depth -= 1;
		else {
			out.push(depth > 0 ? " " : char);
			continue;
		}
		out.push(" ");
	}

	return out.join("");
}

/** Render a `PERMISSIONS` clause from either form. */
function permissions(rules: TablePermissions): string {
	if (typeof rules === "string") return `PERMISSIONS ${rules}`;

	const clauses = Object.entries(rules)
		.filter(([, rule]) => rule !== undefined)
		.map(([operation, rule]) => `FOR ${operation} ${rule}`);

	return clauses.length ? `PERMISSIONS ${clauses.join(", ")}` : "";
}

/** Render a table name, or a union of them, for an edge's `IN`/`OUT`. */
function tableList(tables: string | readonly string[]): string {
	return Array.isArray(tables) ? tables.join(" | ") : String(tables);
}

/**
 * Render a default value.
 *
 * Strings are ambiguous: `'active'` is a literal, but `time::now()` is an
 * expression that must not be quoted. Anything that looks like a call, a
 * variable, a block or a comparison is passed through untouched.
 */
function literal(value: unknown): string {
	if (typeof value === "string") {
		return isExpression(value) ? value : quote(value, "'");
	}
	if (value === null) return "NULL";
	if (value === undefined) return "NONE";
	if (Array.isArray(value) || typeof value === "object") {
		return JSON.stringify(value);
	}
	return String(value);
}

/** Whether a string should be treated as SurrealQL rather than a literal. */
function isExpression(value: string): boolean {
	return (
		value.includes("(") ||
		value.startsWith("$") ||
		value.startsWith("{") ||
		value.startsWith("[")
	);
}

/**
 * Quote a string for SurrealQL, escaping any embedded quotes.
 *
 * Single quotes are the default because that is how SurrealDB stores string
 * literals; emitting double quotes would make every commented field look
 * modified on the next diff.
 */
function quote(value: string, mark = "'"): string {
	return `${mark}${value.split(mark).join(`\\${mark}`)}${mark}`;
}
