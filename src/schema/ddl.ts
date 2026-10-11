import { escapeIdent, toSurqlString } from "surrealdb";
import {
	type AbstractType,
	ArrayType,
	BoolType,
	DateType,
	DurationType,
	type HasDefault,
	LiteralType,
	NoneType,
	NullType,
	NumberType,
	ObjectType,
	OptionType,
	PointType,
	RecordType,
	StringType,
	SurqlExpression,
	UnionType,
	UuidType,
} from "../types";
import type { EdgeSchema } from "./edge";
import type { Orm } from "./orm";
import type { TableSchema } from "./table";

/** What a statement defines. Together with `name`, it identifies the statement. */
export type StatementKind = "table" | "field";

/** One `DEFINE` statement generated from a schema. */
export type SchemaStatement = {
	kind: StatementKind;
	/**
	 * The object it defines: the table (`user`), or the field with its table
	 * (`user.name.first`, `post.tags[*]`). Stable across runs, so two
	 * generations can be compared by name.
	 */
	name: string;
	/** The statement, ending without a semicolon. */
	sql: string;
};

/** Something in the schema that could not be turned into a statement, and why. */
export type SkippedDefinition = {
	/** Where it is, such as `user.posts`. */
	path: string;
	reason: string;
};

export type SchemaOptions = {
	/**
	 * Make tables `SCHEMAFULL`: the database rejects a write that has a field the
	 * schema does not declare. The default is `SCHEMALESS`, which types the
	 * declared fields and leaves others alone, as the client-side validation does.
	 */
	schemafull?: boolean;
	/**
	 * Whether a statement replaces a definition that exists (`OVERWRITE`, the
	 * default) or leaves it (`IF NOT EXISTS`).
	 */
	mode?: "overwrite" | "if-not-exists";
};

/** The result of {@link generateSchema}. */
export type GeneratedSchema = {
	/** Every table before its fields, so the output can be run top to bottom. */
	statements: SchemaStatement[];
	/** What the schema holds that has no `DEFINE`, and why. */
	skipped: SkippedDefinition[];
};

const inline = (value: unknown): string =>
	typeof value === "string" ? JSON.stringify(value) : toSurqlString(value);

type Unsupported = { unsupported: string };
const isUnsupported = (value: string | Unsupported): value is Unsupported =>
	typeof value !== "string";

/** A table name or field name segment, escaped when it is not a plain identifier. */
const ident = (name: string): string => escapeIdent(name);

/**
 * The SurrealQL type of `type`. An object is `object` when its fields are
 * defined one by one (`literal` false), and a literal object type `{ a: string }`
 * when it sits where they cannot be (inside a union or a tuple), where the
 * database also rejects a field the type does not list.
 */
function typeOf(type: AbstractType, literal: boolean): string | Unsupported {
	if (type instanceof OptionType) {
		const inner = typeOf(type.schema, literal);
		return isUnsupported(inner) ? inner : `option<${inner}>`;
	}
	if (type instanceof ObjectType) return objectType(type, literal);
	if (type instanceof ArrayType) return arrayType(type);
	if (type instanceof UnionType) return unionType(type);
	return scalarType(type);
}

const SCALARS: [new (...args: never[]) => AbstractType, string][] = [
	[StringType, "string"],
	[NumberType, "number"],
	[BoolType, "bool"],
	[DateType, "datetime"],
	[DurationType, "duration"],
	[UuidType, "uuid"],
	[PointType, "geometry<point>"],
	[NullType, "null"],
	[NoneType, "none"],
];

function scalarType(type: AbstractType): string | Unsupported {
	for (const [Class, sql] of SCALARS) if (type instanceof Class) return sql;
	if (type instanceof LiteralType) return inline(type.value);
	if (type instanceof RecordType) return recordType(type);
	return { unsupported: `${type.name} has no SurrealQL type` };
}

function recordType(type: RecordType): string {
	const tb = type.tb as string | readonly string[] | undefined;
	if (tb === undefined) return "record";
	const tables = (Array.isArray(tb) ? tb : [tb]) as string[];
	return `record<${tables.map(ident).join(" | ")}>`;
}

function objectType(type: ObjectType, literal: boolean): string | Unsupported {
	if (!literal) return "object";
	const parts: string[] = [];
	for (const [key, field] of Object.entries(
		type.schema as Record<string, AbstractType>,
	)) {
		const sql = typeOf(field, true);
		if (isUnsupported(sql))
			return { unsupported: `${key}: ${sql.unsupported}` };
		parts.push(`${ident(key)}: ${sql}`);
	}
	return `{ ${parts.join(", ")} }`;
}

function arrayType(type: ArrayType): string | Unsupported {
	const schema = type.schema as AbstractType | AbstractType[];
	if (Array.isArray(schema)) {
		const members: string[] = [];
		for (const member of schema) {
			const sql = typeOf(member, true);
			if (isUnsupported(sql)) return sql;
			members.push(sql);
		}
		return `[${members.join(", ")}]`;
	}
	const element = typeOf(schema, false);
	return isUnsupported(element) ? element : `array<${element}>`;
}

function unionType(type: UnionType<AbstractType[]>): string | Unsupported {
	const members: string[] = [];
	for (const member of type.schema) {
		const sql = typeOf(member, true);
		if (isUnsupported(sql)) return sql;
		members.push(member instanceof OptionType ? `(${sql})` : sql);
	}
	return members.join(" | ");
}

/** A field's `DEFAULT` clause, or why it has none. */
function defaultOf(
	type: AbstractType,
): { clause: string } | { skipped: string } | undefined {
	const value = (type as Partial<HasDefault>)._default;
	if (value === undefined) return undefined;
	if (value instanceof SurqlExpression)
		return { clause: ` DEFAULT ${value.sql}` };
	if (typeof value === "function") {
		return {
			skipped:
				"its default is a function, which only the client can run; use a value or expr()",
		};
	}
	return { clause: ` DEFAULT ${inline(value)}` };
}

type Context = {
	table: string;
	define: string;
	statements: SchemaStatement[];
	skipped: SkippedDefinition[];
};

/** The base of an array of arrays of … of objects, and how many arrays wrap it. */
function fieldsBelow(type: AbstractType, path: string, ctx: Context): void {
	let inner = type;
	let at = path;
	for (;;) {
		if (inner instanceof OptionType) inner = inner.schema;
		else if (
			inner instanceof ArrayType &&
			!Array.isArray(inner.schema as AbstractType | AbstractType[])
		) {
			inner = inner.schema as AbstractType;
			at = `${at}[*]`;
		} else break;
	}
	if (!(inner instanceof ObjectType)) return;
	for (const [key, field] of Object.entries(
		inner.schema as Record<string, AbstractType>,
	)) {
		fieldStatement(field, `${at}.${ident(key)}`, ctx);
	}
}

function fieldStatement(type: AbstractType, path: string, ctx: Context): void {
	const sql = typeOf(type, false);
	const where = `${ctx.table}.${path}`;
	if (isUnsupported(sql)) {
		ctx.skipped.push({ path: where, reason: sql.unsupported });
		return;
	}
	const fallback = defaultOf(type);
	if (fallback && "skipped" in fallback) {
		ctx.skipped.push({ path: where, reason: fallback.skipped });
	}
	const clause = fallback && "clause" in fallback ? fallback.clause : "";
	ctx.statements.push({
		kind: "field",
		name: where,
		sql: `DEFINE FIELD ${ctx.define} ${path} ON TABLE ${ident(ctx.table)} TYPE ${sql}${clause}`,
	});
	fieldsBelow(type, path, ctx);
}

const isEdge = (schema: TableSchema | EdgeSchema): schema is EdgeSchema =>
	"from" in schema;

const names = (value: string | readonly string[]): string =>
	(Array.isArray(value) ? (value as string[]) : [value as string])
		.map(ident)
		.join(" | ");

function tableStatement(
	schema: TableSchema | EdgeSchema,
	define: string,
	schemafull: boolean,
): SchemaStatement {
	const relation = isEdge(schema)
		? ` TYPE RELATION IN ${names(schema.from)} OUT ${names(schema.to)}`
		: "";
	const mode = schemafull ? "SCHEMAFULL" : "SCHEMALESS";
	return {
		kind: "table",
		name: schema.tb,
		sql: `DEFINE TABLE ${define} ${ident(schema.tb)}${relation} ${mode}`,
	};
}

/**
 * Generate the `DEFINE` statements for the tables and edges of an ORM: each
 * table, then each of its fields with its type and default, and computed fields.
 * The statements are what makes the schema the source of truth: running them
 * makes the database enforce what the types describe.
 *
 * Nothing is guessed. A field that cannot be expressed in SurrealQL (a graph
 * traversal, a default that is a function) is listed in `skipped`, with the
 * reason, and left to the client.
 *
 * @example
 * ```ts
 * const { statements } = generateSchema(db);
 * await surreal.query(statements.map((s) => s.sql).join(";\n"));
 * ```
 */
export function generateSchema(
	// biome-ignore lint/suspicious/noExplicitAny: accepts an ORM over any tables
	orm: Orm<any>,
	options: SchemaOptions = {},
): GeneratedSchema {
	const define =
		options.mode === "if-not-exists" ? "IF NOT EXISTS" : "OVERWRITE";
	const statements: SchemaStatement[] = [];
	const skipped: SkippedDefinition[] = [];
	for (const schema of Object.values(orm.tables) as (
		| TableSchema
		| EdgeSchema
	)[]) {
		statements.push(
			tableStatement(schema, define, options.schemafull ?? false),
		);
		const ctx: Context = { table: schema.tb, define, statements, skipped };
		fieldStatements(schema, ctx);
		statements.push(...computedStatements(orm, schema, define));
	}
	return { statements, skipped };
}

/** The statements for the fields a table declares, other than its computed ones. */
function fieldStatements(schema: TableSchema | EdgeSchema, ctx: Context): void {
	const computed = new Set(
		"computedFields" in schema ? schema.computedFields : [],
	);
	for (const [name, type] of Object.entries(
		schema._fields as Record<string, AbstractType>,
	)) {
		if (!computed.has(name)) fieldStatement(type, ident(name), ctx);
	}
}

/** The statements for the computed fields of a table, which the table renders itself. */
function computedStatements(
	// biome-ignore lint/suspicious/noExplicitAny: accepts an ORM over any tables
	orm: Orm<any>,
	schema: TableSchema | EdgeSchema,
	define: string,
): SchemaStatement[] {
	if (!("computedStatements" in schema)) return [];
	return schema.computedStatements(orm).map((sql) => ({
		kind: "field" as const,
		name: `${schema.tb}.${sql.match(/FIELD (?:OVERWRITE|IF NOT EXISTS) (\S+) ON/)?.[1] ?? "?"}`,
		sql: define === "OVERWRITE" ? sql : sql.replace("OVERWRITE", define),
	}));
}

/** The statements as the text of a `.surql` file, one per line, with a semicolon each. */
export function toSurql(schema: GeneratedSchema): string {
	return `${schema.statements.map((s) => `${s.sql};`).join("\n")}\n`;
}
