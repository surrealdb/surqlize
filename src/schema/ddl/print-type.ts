import {
	type AbstractType,
	AnyType,
	ArrayType,
	BoolType,
	BytesType,
	DateType,
	DecimalType,
	DurationType,
	FloatType,
	GeometryType,
	IntType,
	LiteralType,
	NoneType,
	NullType,
	NumberType,
	ObjectType,
	OptionType,
	PointType,
	RangeType,
	RecordType,
	SetType,
	StringType,
	UnionType,
	UuidType,
} from "../../types/classes";
import { ident, quote } from "./syntax";

/**
 * Render a type as the SurrealQL type expression used in `DEFINE FIELD … TYPE`.
 *
 * This is distinct from a type's `expected`, which describes the *TypeScript*
 * shape for error messages (`Option<string>`, `RecordId<user>`). What SurrealDB
 * wants is its own syntax (`option<string>`, `record<user>`).
 *
 * An object is `object` where its fields are defined one by one, which is the
 * case for a field and for the elements of an array. Inside a union or a tuple
 * they cannot be, so there it is a literal object type, `{ kind: 'a', n: number }`,
 * which the database also holds to exactly those keys.
 *
 * @param type - The type to render
 * @param inline - Whether an object is written out, rather than as `object`
 * @returns A SurrealQL type expression
 */
export function printSurqlType(type: AbstractType, inline = false): string {
	// Order matters: every subclass must be tested before its base, or an
	// IntType would print as `number` and a SetType as `array`.
	return (
		printComposite(type, inline) ??
		(type instanceof ObjectType && inline ? printObject(type) : null) ??
		LEAF_TYPES.find(([cls]) => type instanceof cls)?.[1] ??
		// GraphType and anything else added later: `any` is the only safe
		// fallback, and it is never wrong — just less precise than it could be.
		"any"
	);
}

/** Render the types that wrap or enumerate other types, or `null` if not one. */
function printComposite(type: AbstractType, inline: boolean): string | null {
	if (type instanceof OptionType) {
		return `option<${printSurqlType(type.schema, inline)}>`;
	}

	// SurrealDB takes a maximum length only — `array<string, 1, 10>` is a parse
	// error — so a lower bound has to be expressed as an ASSERT.
	if (type instanceof SetType) {
		return `set<${printSurqlType(type.schema as AbstractType)}${bound(type.max)}>`;
	}

	if (type instanceof ArrayType) return printArray(type);

	if (type instanceof RecordType) {
		const tb = type.tb;
		if (tb === undefined) return "record";
		return `record<${(Array.isArray(tb) ? tb : [tb]).map(ident).join(" | ")}>`;
	}

	if (type instanceof GeometryType) {
		return type.kind ? `geometry<${type.kind}>` : "geometry";
	}

	if (type instanceof UnionType) return printMembers(type.schema, " | ");

	if (type instanceof LiteralType) {
		const value = type.value;
		return typeof value === "string" ? quote(value) : String(value);
	}

	return null;
}

/**
 * Render an array as `array<T>`, or a tuple as `[A, B]`, which holds the
 * database to its length and to the type at each position.
 */
function printArray(type: ArrayType): string {
	const schema = type.schema as AbstractType | AbstractType[];
	if (Array.isArray(schema)) return `[${printMembers(schema, ", ")}]`;
	return `array<${printSurqlType(schema)}${bound(type.max)}>`;
}

/** Render the members of a union or tuple, which is where an object is written out. */
function printMembers(members: AbstractType[], separator: string): string {
	const printed = members.map((member) => printSurqlType(member, true));
	// A union has no use for the same type twice; a tuple needs each position.
	return (separator === " | " ? [...new Set(printed)] : printed).join(
		separator,
	);
}

/** Render an object as a literal object type: `{ a: string, b: option<number> }`. */
function printObject(type: ObjectType): string {
	const fields = Object.entries(
		type.schema as Record<string, AbstractType>,
	).map(([key, field]) => `${ident(key)}: ${printSurqlType(field, true)}`);
	return `{ ${fields.join(", ")} }`;
}

/** Render a maximum length as the trailing argument of `array` or `set`. */
function bound(max: number | undefined): string {
	return max === undefined ? "" : `, ${max}`;
}

/**
 * Types with no inner structure, paired with their SurrealQL spelling.
 *
 * Ordered narrowest-first: `IntType` extends `NumberType`, so testing the base
 * first would print every integer field as `number`.
 */
const LEAF_TYPES: [abstract new (...args: never[]) => AbstractType, string][] =
	[
		[IntType, "int"],
		[FloatType, "float"],
		[DecimalType, "decimal"],
		[NumberType, "number"],
		[StringType, "string"],
		[BoolType, "bool"],
		[DateType, "datetime"],
		[UuidType, "uuid"],
		[DurationType, "duration"],
		[BytesType, "bytes"],
		[PointType, "geometry<point>"],
		[ObjectType, "object"],
		// SurrealDB has no `range<T>` — only a bare `range`.
		[RangeType, "range"],
		[NullType, "null"],
		[NoneType, "none"],
		[AnyType, "any"],
	];
