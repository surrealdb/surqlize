import type { DefinableSchema } from "../ddl/define";
import { flattenFields } from "../ddl/flatten";
import { printSurqlType } from "../ddl/print-type";
import { EdgeSchema } from "../edge";

/**
 * The flattened view of a schema that diagram rendering works from.
 *
 * Rendering is pure string manipulation over these shapes, which keeps it
 * independent of how a schema happens to be declared — and makes every rule
 * testable without building a `TableSchema`.
 */

/** A field as a diagram needs to see it. */
export interface DiagramField {
	/** Dotted path, e.g. `address.street`. */
	name: string;
	/** The SurrealQL type, e.g. `option<array<record<user>>>`. */
	type: string;
	readonly: boolean;
	default: unknown;
	/** A `VALUE` expression, if any. */
	value: string | null;
	/** Whether that value is deferred (`VALUE { … }`). */
	computed: boolean;
	/** Assert conditions, joined as they are for DDL. */
	assert: string | null;
	comment: string | null;
	/** Whether a unique index covers this field. */
	unique: boolean;
}

/** A table as a diagram needs to see it. */
export interface DiagramTable {
	name: string;
	fields: DiagramField[];
}

/** An edge between two tables. */
export interface DiagramRelation {
	/** The edge table's name, used as the label. */
	name: string;
	from: string;
	to: string;
	/** Whether any of the edge's own fields is a collection. */
	collection: boolean;
}

/** Everything a diagram is drawn from. */
export interface DiagramModel {
	tables: DiagramTable[];
	relations: DiagramRelation[];
}

/**
 * Fields SurrealDB manages, which must not be read as links.
 *
 * `id` is injected into every schema as `record<tb>`, so inferring a link from
 * it would draw a self-reference on every table. `in` and `out` define an edge,
 * which is already drawn as an edge.
 */
const STRUCTURAL = new Set(["id", "in", "out"]);

/**
 * Reduce a set of schemas to the model a diagram is drawn from.
 *
 * @param definitions - Tables and edges; anything else is ignored
 * @returns Tables with flattened fields, and the edges between them
 */
export function toDiagramModel(definitions: DefinableSchema[]): DiagramModel {
	const tables: DiagramTable[] = [];
	const relations: DiagramRelation[] = [];

	for (const definition of definitions) {
		if (definition instanceof EdgeSchema) {
			relations.push(...toRelations(definition));
			continue;
		}
		tables.push(toTable(definition));
	}

	return { tables, relations };
}

/** Whether a field name is one SurrealDB manages rather than the schema. */
export function isStructuralField(name: string): boolean {
	return STRUCTURAL.has(name);
}

/** Flatten a table's fields into the diagram's view of them. */
function toTable(schema: DefinableSchema): DiagramTable {
	const unique = uniqueFields(schema);

	return {
		name: schema.tb,
		// Nested objects become dotted rows, matching how they are defined.
		fields: flattenFields(schema.fields).map((field) => {
			const ddl = field.ddl;

			return {
				name: field.name,
				type: printSurqlType(field.type),
				readonly: ddl.readonly === true,
				default: ddl.default?.value,
				value: ddl.value ?? ddl.computed ?? null,
				computed: ddl.computed !== undefined,
				// Joined the way DDL joins them, so constraint summaries that look
				// for `AND` still recognise a pair of bounds.
				assert: ddl.assert?.length ? ddl.assert.join(" AND ") : null,
				comment: ddl.comment ?? null,
				unique: unique.has(field.name),
			};
		}),
	};
}

/**
 * An edge, expanded across every source and target it accepts.
 *
 * `edge(["post", "user"], "tagged", "tag", …)` is one definition but two arrows.
 */
function toRelations(schema: EdgeSchema): DiagramRelation[] {
	const sources = asArray(schema.from);
	const targets = asArray(schema.to);

	// An edge carrying a collection field suggests many-to-many.
	const collection = flattenFields(schema.fields).some(
		(field) =>
			!isStructuralField(field.name) &&
			/\b(array|set)</.test(printSurqlType(field.type)),
	);

	return sources.flatMap((from) =>
		targets.map((to) => ({ name: schema.tb, from, to, collection })),
	);
}

/**
 * Field names covered by a unique index.
 *
 * smig inferred uniqueness by looking for the word UNIQUE inside an assert
 * string. The indexes are known here, so ask them.
 */
function uniqueFields(schema: DefinableSchema): Set<string> {
	const names = new Set<string>();

	for (const index of Object.values(schema.ddl.indexes ?? {})) {
		if (!index.unique) continue;
		for (const field of index.fields ?? []) names.add(field);
	}

	return names;
}

/** Treat a value that may be a single name or several as an array. */
function asArray(value: string | readonly string[]): string[] {
	return Array.isArray(value) ? [...value] : [value as string];
}
