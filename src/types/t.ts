import type { Workable, WorkableContext } from "../utils";
import {
	type AbstractType,
	ArrayType,
	BoolType,
	DateType,
	LiteralType,
	NeverType,
	NoneType,
	NullType,
	NumberType,
	ObjectType,
	OptionType,
	RecordType,
	StringType,
	UnionType,
	UuidType,
} from "./classes";

/** Create a string type. */
export function string() {
	return new StringType();
}

/** Create a number type. */
export function number() {
	return new NumberType();
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

/** Create a record reference type, optionally scoped to a specific table. */
export function record<T extends string | undefined>(
	table?: T extends string ? T : T extends undefined ? T : never,
) {
	return new RecordType<T>(table as T);
}

/** Extract the inferred TypeScript type from a type definition or workable. */
export type infer<T extends AbstractType | Workable> =
	T extends Workable<WorkableContext, infer T>
		? T["infer"]
		: T extends AbstractType
			? T["infer"]
			: never;
