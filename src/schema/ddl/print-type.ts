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
	RangeType,
	RecordType,
	SetType,
	StringType,
	UnionType,
	UuidType,
} from "../../types/classes";

/**
 * Render a type as the SurrealQL type expression used in `DEFINE FIELD … TYPE`.
 *
 * This is distinct from a type's `expected`, which describes the *TypeScript*
 * shape for error messages (`Option<string>`, `RecordId<user>`). What SurrealDB
 * wants is its own syntax (`option<string>`, `record<user>`).
 *
 * @param type - The type to render
 * @returns A SurrealQL type expression
 */
export function printSurqlType(type: AbstractType): string {
	// Order matters: every subclass must be tested before its base, or an
	// IntType would print as `number` and a SetType as `array`.
	return (
		printComposite(type) ??
		LEAF_TYPES.find(([cls]) => type instanceof cls)?.[1] ??
		// GraphType and anything else added later: `any` is the only safe
		// fallback, and it is never wrong — just less precise than it could be.
		"any"
	);
}

/** Render the types that wrap or enumerate other types, or `null` if not one. */
function printComposite(type: AbstractType): string | null {
	if (type instanceof OptionType) {
		return `option<${printSurqlType(type.schema)}>`;
	}

	// SurrealDB takes a maximum length only — `array<string, 1, 10>` is a parse
	// error — so a lower bound has to be expressed as an ASSERT.
	if (type instanceof SetType) {
		return `set<${printSurqlType(type.schema as AbstractType)}${bound(type.max)}>`;
	}

	if (type instanceof ArrayType) {
		return `array<${printElements(type.schema)}${bound(type.max)}>`;
	}

	if (type instanceof RecordType) {
		const tb = type.tb;
		if (tb === undefined) return "record";
		return `record<${(Array.isArray(tb) ? tb : [tb]).join(" | ")}>`;
	}

	if (type instanceof GeometryType) {
		return type.kind ? `geometry<${type.kind}>` : "geometry";
	}

	if (type instanceof UnionType) return printElements(type.schema);

	if (type instanceof LiteralType) {
		const value = type.value;
		return typeof value === "string" ? `'${value}'` : String(value);
	}

	return null;
}

/** Render a maximum length as the trailing argument of `array` or `set`. */
function bound(max: number | undefined): string {
	return max === undefined ? "" : `, ${max}`;
}

/**
 * Render one or more types as a deduplicated union.
 *
 * A tuple has no direct SurrealQL equivalent, so `array([string, int])` becomes
 * `array<string | int>` — the closest honest type.
 */
function printElements(schema: AbstractType | AbstractType[]): string {
	if (!Array.isArray(schema)) return printSurqlType(schema);
	return [...new Set(schema.map(printSurqlType))].join(" | ");
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
		[ObjectType, "object"],
		// SurrealDB has no `range<T>` — only a bare `range`.
		[RangeType, "range"],
		[NullType, "null"],
		[NoneType, "none"],
		[AnyType, "any"],
	];
