import {
	type DefinableSchema,
	defineField,
	defineTable,
} from "../schema/ddl/define";
import type { DatabaseEntity } from "../schema/ddl/entities";
import { defineEvent } from "../schema/ddl/event-ddl";
import type { FlatField } from "../schema/ddl/flatten";
import { flattenFields } from "../schema/ddl/flatten";
import { defineIndex } from "../schema/ddl/index-ddl";
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
		| "field.rename"
		| "index.create"
		| "index.modify"
		| "index.remove"
		| "event.create"
		| "event.modify"
		| "event.remove"
		| "entity.create"
		| "entity.modify"
		| "entity.remove";
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
	definitions: (DefinableSchema | DatabaseEntity)[],
	current: CurrentSchema,
	options: DiffOptions = {},
): Diff {
	const changes: Change[] = [];
	const schemas = definitions.filter(isTableSchema);
	const entities = definitions.filter(isDatabaseEntity);
	const declared = new Set(schemas.map((s) => s.tb));

	changes.push(...diffEntities(entities, current, options));

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
	const up = defineSchemaStatements(schema);

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
	changes.push(...diffAttachments(schema, current, options));
	return changes;
}

/**
 * Compare a table's indexes and events.
 *
 * Both are named definitions attached to a table, so they diff identically —
 * only the statement they render to differs.
 */
function diffAttachments(
	schema: DefinableSchema,
	current: CurrentTable,
	options: DiffOptions,
): Change[] {
	return [
		...diffNamed(
			schema.ddl.indexes ?? {},
			current.indexes,
			"index",
			(name, spec, overwrite) =>
				defineIndex(schema.tb, { name, ...spec }, { overwrite }),
			(name) => `REMOVE INDEX ${name} ON TABLE ${schema.tb};`,
			options,
		),
		...diffNamed(
			schema.ddl.events ?? {},
			current.events,
			"event",
			(name, spec, overwrite) =>
				defineEvent(schema.tb, { name, ...spec }, { overwrite }),
			(name) => `REMOVE EVENT ${name} ON TABLE ${schema.tb};`,
			options,
		),
	].map((change) => ({
		...change,
		target: `${schema.tb}.${change.target}`,
	}));
}

/** Diff a set of named definitions attached to a table. */
function diffNamed<T extends { previousNames?: string[] }>(
	declared: Record<string, T>,
	stored: Record<string, string>,
	kind: "index" | "event",
	define: (name: string, spec: T, overwrite: boolean) => string,
	remove: (name: string) => string,
	options: DiffOptions,
): Change[] {
	const changes: Change[] = [];
	const renamedFrom = new Set<string>();

	for (const [name, spec] of Object.entries(declared)) {
		const existing = stored[name];

		// Renaming one of these is just redefining it under the new name: they
		// hold no data of their own, so nothing has to be carried across.
		const oldName = !existing
			? spec.previousNames?.find((previous) => stored[previous])
			: undefined;

		if (oldName) {
			renamedFrom.add(oldName);
			changes.push({
				kind: `${kind}.modify`,
				target: `${oldName} -> ${name}`,
				up: [define(name, spec, false), remove(oldName)],
				down: [`${stored[oldName]};`, remove(name)],
			});
			continue;
		}

		if (!existing) {
			changes.push({
				kind: `${kind}.create`,
				target: name,
				up: [define(name, spec, false)],
				down: [remove(name)],
			});
			continue;
		}

		if (!same(define(name, spec, false), existing)) {
			changes.push({
				kind: `${kind}.modify`,
				target: name,
				up: [define(name, spec, true)],
				down: [`${existing};`],
			});
		}
	}

	if (!options.removeMissing) return changes;

	for (const [name, existing] of Object.entries(stored)) {
		if (name in declared || renamedFrom.has(name)) continue;
		changes.push({
			kind: `${kind}.remove`,
			target: name,
			up: [remove(name)],
			down: [`${existing};`],
		});
	}

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

	if (!options.removeMissing) return changes;

	const declaredNames = new Set(fields.map((f) => storedName(f.name)));
	changes.push(
		...removeUndeclaredFields(schema, current, declaredNames, renamedFrom),
	);

	return changes;
}

/**
 * The fields the database has and the schema does not claim.
 *
 * Not everything unclaimed is drift: SurrealDB creates an element field for
 * every array, and defines `in`/`out` on a relation and `id` everywhere. All of
 * those are absent from the declared set by design, and removing them is either
 * pointless or destructive.
 */
function removeUndeclaredFields(
	schema: DefinableSchema,
	current: CurrentTable,
	declaredNames: Set<string>,
	renamedFrom: Set<string>,
): Change[] {
	const changes: Change[] = [];

	for (const [name, stored] of Object.entries(current.fields)) {
		if (declaredNames.has(name) || renamedFrom.has(name)) continue;
		if (isArrayElement(name, declaredNames)) continue;
		if (isDatabaseOwned(name, schema)) continue;

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
/**
 * Whether SurrealDB owns this field rather than the schema.
 *
 * `definableFields` excludes `in`/`out` on a relation and the injected `id`,
 * because emitting a `DEFINE` for them is either rejected or redundant. That
 * leaves them out of the declared set too, so without this they read as drift —
 * and `--remove-missing` offers to strip the endpoints off every edge in the
 * database, which no re-run of the migration puts back.
 */
function isDatabaseOwned(name: string, schema: DefinableSchema): boolean {
	if (name === "id") return true;
	return schema instanceof EdgeSchema && (name === "in" || name === "out");
}

function isArrayElement(name: string, declared: Set<string>): boolean {
	const marker = name.indexOf(".*");
	if (marker === -1) return false;
	return declared.has(name.slice(0, marker));
}

/** Whether a definition is a table or edge rather than a database-level entity. */
function isTableSchema(
	definition: DefinableSchema | DatabaseEntity,
): definition is DefinableSchema {
	return "tb" in definition;
}

/** Whether a definition belongs to the database rather than a table. */
function isDatabaseEntity(
	definition: DefinableSchema | DatabaseEntity,
): definition is DatabaseEntity {
	return "kind" in definition && "define" in definition;
}

/**
 * Compare database-level definitions — analyzers, params, functions, sequences
 * and access methods.
 */
function diffEntities(
	entities: DatabaseEntity[],
	current: CurrentSchema,
	options: DiffOptions,
): Change[] {
	const changes: Change[] = [];
	const seen = new Map<string, Set<string>>();

	for (const entity of entities) {
		const stored = current.entities[entity.kind] ?? {};
		const claimed = seen.get(entity.kind) ?? new Set<string>();
		claimed.add(entity.key);
		seen.set(entity.kind, claimed);

		const change = diffEntity(entity, stored);
		if (!change) continue;

		if (change.renamedFrom) claimed.add(change.renamedFrom);
		changes.push(change.change);
	}

	if (options.removeMissing) {
		changes.push(...removeUndeclaredEntities(entities, current, seen));
	}

	return changes;
}

/** Compare one database-level definition against what the database has. */
function diffEntity(
	entity: DatabaseEntity,
	stored: Record<string, string>,
): { change: Change; renamedFrom?: string } | null {
	const existing = stored[entity.key];

	if (!existing) {
		const oldName = entity.previousNames?.find((previous) => stored[previous]);

		if (oldName) {
			return {
				renamedFrom: oldName,
				change: {
					kind: "entity.modify",
					target: `${entity.kind} ${oldName} -> ${entity.name}`,
					up: [entity.define(), removeNamed(entity, oldName)],
					down: [`${stored[oldName]};`, entity.remove()],
				},
			};
		}

		return {
			change: {
				kind: "entity.create",
				target: `${entity.kind} ${entity.name}`,
				up: [entity.define()],
				down: [entity.remove()],
			},
		};
	}

	// Some definitions hide a secret when read back, so their stored form can
	// never match what was declared. Creating one when absent is safe;
	// re-applying it on every run would rotate the secret each time. The
	// definition says whether it is one of those — a BEARER access and a JWT
	// access backed by a published key set both compare fine.
	if (entity.opaque) return null;
	if (same(entity.define(), existing)) return null;

	return {
		change: {
			kind: "entity.modify",
			target: `${entity.kind} ${entity.name}`,
			up: [entity.define({ overwrite: true })],
			down: [`${existing};`],
		},
	};
}

/** Drop database-level definitions the schema no longer declares. */
function removeUndeclaredEntities(
	entities: DatabaseEntity[],
	current: CurrentSchema,
	seen: Map<string, Set<string>>,
): Change[] {
	const changes: Change[] = [];

	for (const [kind, stored] of Object.entries(current.entities)) {
		// Only kinds the schema uses at all are managed; a database may hold
		// definitions this schema knows nothing about.
		const entity = entities.find((candidate) => candidate.kind === kind);
		if (!entity) continue;

		for (const [name, existing] of Object.entries(stored)) {
			if (seen.get(kind)?.has(name)) continue;

			changes.push({
				kind: "entity.remove",
				target: `${kind} ${name}`,
				up: [removeNamed(entity, name)],
				down: [`${existing};`],
			});
		}
	}

	return changes;
}

/** The `REMOVE` statement for a different name of the same kind. */
function removeNamed(entity: DatabaseEntity, name: string): string {
	return entity.remove(name);
}

/** Every statement that creates a table from scratch. */
function defineSchemaStatements(schema: DefinableSchema): string[] {
	const statements = [defineTable(schema)];

	for (const field of definableFields(schema)) {
		statements.push(defineField(schema.tb, field));
	}
	for (const [name, index] of Object.entries(schema.ddl.indexes ?? {})) {
		statements.push(defineIndex(schema.tb, { name, ...index }));
	}
	for (const [name, event] of Object.entries(schema.ddl.events ?? {})) {
		statements.push(defineEvent(schema.tb, { name, ...event }));
	}

	return statements;
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
