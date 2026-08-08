import {
	type DefinableSchema,
	defineField,
	defineTable,
} from "../schema/ddl/define";
import type { FlatField } from "../schema/ddl/flatten";
import { flattenFields } from "../schema/ddl/flatten";
import { EdgeSchema } from "../schema/edge";
import { canonicalise } from "./canonical";
import type { CurrentSchema, CurrentTable } from "./introspect";

/** One change a migration makes, with the statements to apply and undo it. */
export interface Change {
	kind:
		| "table.create"
		| "table.modify"
		| "table.remove"
		| "field.create"
		| "field.modify"
		| "field.remove"
		| "field.rename";
	/** What changed, e.g. `user` or `user.email`. */
	target: string;
	up: string[];
	down: string[];
}

/** The result of comparing a schema against a database. */
export interface Diff {
	changes: Change[];
	/** Every `up` statement, in order. */
	up: string[];
	/** Every `down` statement, in reverse order. */
	down: string[];
}

/** How to treat things in the database that the schema does not mention. */
export interface DiffOptions {
	/**
	 * Drop tables and fields the schema no longer declares.
	 *
	 * Off by default: a schema is usually a partial view of a database, and
	 * dropping whatever it does not mention destroys data. The CLI turns this on
	 * explicitly.
	 */
	removeMissing?: boolean;
}

/**
 * Compare a set of schemas against the database's current state.
 *
 * @param schemas - The tables and edges the schema declares
 * @param current - The database's current schema, from {@link introspect}
 * @param options - How to treat undeclared tables and fields
 * @returns The changes needed to bring the database in line
 */
export function diff(
	schemas: DefinableSchema[],
	current: CurrentSchema,
	options: DiffOptions = {},
): Diff {
	const changes: Change[] = [];
	const declared = new Set(schemas.map((s) => s.tb));

	for (const schema of schemas) {
		const table = current.tables[schema.tb];
		if (table) {
			changes.push(...diffTable(schema, table, options));
		} else {
			changes.push(createTable(schema));
		}
	}

	if (options.removeMissing) {
		for (const name of Object.keys(current.tables)) {
			if (declared.has(name)) continue;
			changes.push({
				kind: "table.remove",
				target: name,
				up: [`REMOVE TABLE ${name};`],
				// The table's definition is known, but its data is not, so a
				// rollback can only restore the shape.
				down: [`${current.tables[name]?.definition};`],
			});
		}
	}

	return {
		changes,
		up: changes.flatMap((c) => c.up),
		down: [...changes].reverse().flatMap((c) => c.down),
	};
}

/** Every statement needed to create a table that does not exist yet. */
function createTable(schema: DefinableSchema): Change {
	const up = [defineTable(schema)];
	for (const field of definableFields(schema)) {
		up.push(defineField(schema.tb, field));
	}

	return {
		kind: "table.create",
		target: schema.tb,
		up,
		down: [`REMOVE TABLE ${schema.tb};`],
	};
}

/** Compare one declared table against its current state. */
function diffTable(
	schema: DefinableSchema,
	current: CurrentTable,
	options: DiffOptions,
): Change[] {
	const changes: Change[] = [];

	const desiredTable = defineTable(schema);
	if (!same(desiredTable, current.definition)) {
		changes.push({
			kind: "table.modify",
			target: schema.tb,
			up: [defineTable(schema, { overwrite: true })],
			down: [`${current.definition};`],
		});
	}

	changes.push(...diffFields(schema, current, options));
	return changes;
}

/** Compare a table's declared fields against the ones the database has. */
function diffFields(
	schema: DefinableSchema,
	current: CurrentTable,
	options: DiffOptions,
): Change[] {
	const changes: Change[] = [];
	const fields = definableFields(schema);
	const renamedFrom = new Set<string>();

	for (const field of fields) {
		const stored = current.fields[storedName(field.name)];

		// A field the schema says used to be called something else, where that
		// something else is still in the database and the new name is not.
		const oldName = renameSource(field, current);
		if (oldName) {
			renamedFrom.add(oldName);
			changes.push(renameField(schema, field, oldName, current));
			continue;
		}

		if (!stored) {
			changes.push({
				kind: "field.create",
				target: `${schema.tb}.${field.name}`,
				up: [defineField(schema.tb, field)],
				down: [`REMOVE FIELD ${field.name} ON TABLE ${schema.tb};`],
			});
			continue;
		}

		const desired = defineField(schema.tb, field);
		if (!same(desired, stored)) {
			changes.push({
				kind: "field.modify",
				target: `${schema.tb}.${field.name}`,
				up: [defineField(schema.tb, field, { overwrite: true })],
				down: [`${stored};`],
			});
		}
	}

	const declaredNames = new Set(fields.map((f) => storedName(f.name)));

	if (!options.removeMissing) return changes;

	for (const [name, stored] of Object.entries(current.fields)) {
		if (declaredNames.has(name) || renamedFrom.has(name)) continue;
		// SurrealDB creates an element field for every array; it is not drift.
		if (isArrayElement(name, declaredNames)) continue;

		changes.push({
			kind: "field.remove",
			target: `${schema.tb}.${name}`,
			up: [`REMOVE FIELD ${name} ON TABLE ${schema.tb};`],
			down: [`${stored};`],
		});
	}

	return changes;
}

/**
 * The statements that rename a field while keeping its value.
 *
 * SurrealDB has no `RENAME`, so the value is copied to the new field before the
 * old one is dropped. `REMOVE FIELD` has to come before the `UNSET`: until the
 * definition is gone, a SCHEMAFULL table still enforces the old field's
 * assertions and rejects the unset.
 */
function renameField(
	schema: DefinableSchema,
	field: FlatField,
	oldName: string,
	current: CurrentTable,
): Change {
	const tb = schema.tb;

	return {
		kind: "field.rename",
		target: `${tb}.${oldName} -> ${field.name}`,
		up: [
			defineField(tb, field),
			`UPDATE ${tb} SET ${field.name} = ${oldName};`,
			`REMOVE FIELD ${oldName} ON TABLE ${tb};`,
			`UPDATE ${tb} UNSET ${oldName};`,
		],
		down: [
			`${current.fields[oldName]};`,
			`UPDATE ${tb} SET ${oldName} = ${field.name};`,
			`REMOVE FIELD ${field.name} ON TABLE ${tb};`,
			`UPDATE ${tb} UNSET ${field.name};`,
		],
	};
}

/**
 * The name this field was renamed from, if any.
 *
 * A rename is only claimed when the old name is still in the database and the
 * new one is not, which makes it idempotent: once applied, the same schema
 * produces no further change.
 */
function renameSource(field: FlatField, current: CurrentTable): string | null {
	const previous = field.ddl.previousNames;
	if (!previous?.length) return null;
	if (current.fields[storedName(field.name)]) return null;

	return previous.find((name) => current.fields[storedName(name)]) ?? null;
}

/** Whether `name` is the element field SurrealDB adds for a declared array. */
function isArrayElement(name: string, declared: Set<string>): boolean {
	const marker = name.indexOf(".*");
	if (marker === -1) return false;
	return declared.has(name.slice(0, marker));
}

/** The fields of a schema that are ours to define. */
function definableFields(schema: DefinableSchema): FlatField[] {
	const declared = schema._fields;

	return flattenFields(schema.fields).filter((field) => {
		if (
			schema instanceof EdgeSchema &&
			(field.name === "in" || field.name === "out")
		) {
			return false;
		}
		return !(field.name === "id" && !("id" in declared));
	});
}

/** The key `INFO FOR TABLE` reports a field under. */
function storedName(name: string): string {
	return name.replace(/\[\*\]/g, ".*");
}

/** Whether two definitions describe the same thing. */
function same(a: string, b: string): boolean {
	return canonicalise(a) === canonicalise(b);
}
