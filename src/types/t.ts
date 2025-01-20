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

export function string() {
	return new StringType();
}

export function number() {
	return new NumberType();
}

export function bool() {
	return new BoolType();
}

export { _null as null };
export function _null() {
	return new NullType();
}

export function none() {
	return new NoneType();
}

export function never() {
	return new NeverType();
}

export function date() {
	return new DateType();
}

export function uuid() {
	return new UuidType();
}

export function option<T extends AbstractType>(schema: T) {
	return new OptionType(schema);
}

export function object<T extends Record<string, AbstractType>>(schema: T) {
	return new ObjectType(schema);
}

export function array<T extends AbstractType>(schema: T): ArrayType<T>;
export function array<T extends AbstractType[]>(schema: [...T]): ArrayType<T>;
export function array<T extends AbstractType[] | AbstractType>(schema: T) {
	return new ArrayType(schema);
}

export function union<T extends AbstractType[]>(schema: T) {
	return new UnionType(schema);
}

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

export function record<T extends string | undefined>(
	table?: T extends string ? T : T extends undefined ? T : never,
) {
	return new RecordType<T>(table as T);
}

export type infer<T extends AbstractType | Workable> = T extends Workable<
	WorkableContext,
	infer T
>
	? T["infer"]
	: T extends AbstractType
		? T["infer"]
		: never;
