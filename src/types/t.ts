import type { Workable, WorkableContext } from "../utils";
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
	type GeometryKind,
	GeometryType,
	IntType,
	LiteralType,
	NeverType,
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
} from "./classes";

/** Create a string type. */
export function string() {
	return new StringType();
}

/** Create a number type. Use {@link int}, {@link float} or {@link decimal} when the
 * SurrealDB numeric width matters — a migration needs to know which to define. */
export function number() {
	return new NumberType();
}

/** Create an integer type. Rejects fractional values. */
export function int() {
	return new IntType();
}

/** Create a floating-point type. */
export function float() {
	return new FloatType();
}

/** Create an arbitrary-precision decimal type. */
export function decimal() {
	return new DecimalType();
}

/** Create a duration type. */
export function duration() {
	return new DurationType();
}

/** Create a binary data type. */
export function bytes() {
	return new BytesType();
}

/** Create an any type. Accepts every value. */
export function any() {
	return new AnyType();
}

/** Create a geometry type, optionally constrained to a single kind. */
export function geometry<const K extends GeometryKind | undefined = undefined>(
	kind?: K,
): GeometryType<K> {
	return new GeometryType<K>(kind);
}

/** Create a range type, optionally over a specific inner type. */
export function range(inner?: AbstractType) {
	return new RangeType(inner);
}

/** Create a set type: an array whose elements must be unique. */
export function set<T extends AbstractType>(schema: T) {
	return new SetType(schema);
}

/** Create a boolean type. */
export function bool() {
	return new BoolType();
}

export { _null as null };
/** Create a null type. */
export function _null() {
	return new NullType();
}

/** Create a none type (SurrealDB's NONE). */
export function none() {
	return new NoneType();
}

/** Create a never type. */
export function never() {
	return new NeverType();
}

/** Create a datetime type. */
export function date() {
	return new DateType();
}

/** Create a UUID type. */
export function uuid() {
	return new UuidType();
}

/** Create an optional type. The value may be the inner type or `NONE`. */
export function option<T extends AbstractType>(schema: T) {
	return new OptionType(schema);
}

/** Create an object type with the given field schema. */
export function object<T extends Record<string, AbstractType>>(schema: T) {
	return new ObjectType(schema);
}

/** Create an array type. Pass a single type for a homogeneous array, or a tuple of types. */
export function array<T extends AbstractType>(schema: T): ArrayType<T>;
export function array<T extends AbstractType[]>(schema: [...T]): ArrayType<T>;
export function array<T extends AbstractType[] | AbstractType>(schema: T) {
	return new ArrayType(schema);
}

/** Create a union type that matches any of the given types. */
export function union<T extends AbstractType[]>(schema: T) {
	return new UnionType(schema);
}

/** Create a literal type that matches exactly the given value. */
export function literal<T extends string | number | boolean>(
	value: T extends string
		? T
		: T extends number
			? T
			: T extends boolean
				? T
				: never,
) {
	return new LiteralType<T>(value);
}

/**
 * Create a record reference type, optionally scoped to one or more tables.
 * Passing an array (e.g. `t.record(["post", "user"])`) yields a link that
 * accepts a record from any of the given tables (`record<post | user>`).
 */
export function record<const T extends string | undefined = undefined>(
	table?: T | readonly T[],
): RecordType<T> {
	return new RecordType<T>(table as T | readonly T[]);
}

/** Extract the inferred TypeScript type from a type definition or workable. */
type InferType<T extends AbstractType | Workable> =
	T extends Workable<WorkableContext, infer T>
		? T["infer"]
		: T extends AbstractType
			? T["infer"]
			: never;

export type { InferType as infer };
