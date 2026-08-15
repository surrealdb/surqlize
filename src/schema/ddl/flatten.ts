import {
	type AbstractType,
	ArrayType,
	ObjectType,
	OptionType,
	SetType,
} from "../../types/classes";
import type { FieldDdl } from "../../types/ddl";

/** One `DEFINE FIELD` statement's worth of information. */
export interface FlatField {
	/** The field's path, e.g. `address`, `address.street`, `items[*].name`. */
	name: string;
	type: AbstractType;
	ddl: Readonly<FieldDdl>;
}

/**
 * Expand a nested field map into the flat list SurrealDB defines fields as.
 *
 * A schema nests, because that is what produces the row type:
 *
 * ```ts
 * { address: t.object({ street: t.string() }) }
 * ```
 *
 * SurrealDB does not. Each level is its own statement, and the parent object
 * field must exist or its children have nothing to attach to:
 *
 * ```surql
 * DEFINE FIELD address ON user TYPE object;
 * DEFINE FIELD address.street ON user TYPE string;
 * ```
 *
 * Objects inside an array are addressed through the element wildcard —
 * `items[*].name`. The element field itself (`items[*]`) is **not** emitted:
 * SurrealDB creates it automatically for every array, and defining it by hand
 * would show up as an extra field on the next diff.
 *
 * @param fields - The table's fields, as declared
 * @returns One entry per `DEFINE FIELD` statement, parents before children
 */
export function flattenFields(
	fields: Record<string, AbstractType>,
): FlatField[] {
	const flat: FlatField[] = [];

	for (const [name, type] of Object.entries(fields)) {
		collect(name, type, flat);
	}

	return flat;
}

/** Append `type` at `path`, then recurse into whatever it contains. */
function collect(path: string, type: AbstractType, into: FlatField[]): void {
	into.push({ name: path, type, ddl: type.ddl });

	const nested = nestedObject(type);
	if (!nested) return;

	// Objects held in an array are reached through the element wildcard.
	const prefix = isCollection(type) ? `${path}[*]` : path;
	for (const [key, child] of Object.entries(nested.schema)) {
		collect(`${prefix}.${key}`, child, into);
	}
}

/**
 * Find the object type inside `type`, looking through `option` and array
 * wrappers. Returns null when there is no nested structure to expand.
 */
function nestedObject(type: AbstractType): ObjectType | null {
	const inner = unwrap(type);
	return inner instanceof ObjectType ? (inner as ObjectType) : null;
}

/** Strip `option` and array wrappers to reach the type they hold. */
function unwrap(type: AbstractType): AbstractType {
	if (type instanceof OptionType) return unwrap(type.schema);
	if (type instanceof ArrayType) {
		const schema = type.schema;
		// A tuple has no single element type, so there is nothing to expand into.
		if (Array.isArray(schema)) return type;
		return unwrap(schema);
	}
	return type;
}

/** Whether reaching this type's contents requires the `[*]` element wildcard. */
function isCollection(type: AbstractType): boolean {
	if (type instanceof OptionType) return isCollection(type.schema);
	if (type instanceof SetType) return true;
	if (type instanceof ArrayType) return !Array.isArray(type.schema);
	return false;
}
