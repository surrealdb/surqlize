import { TypeParseError } from "../error.ts";
import { ModelType } from "../schema/model-type.ts";
import type { ComputedKeys } from "../schema/table.ts";
import {
	type AbstractType,
	ArrayType,
	type HasDefault,
	ObjectType,
	type OptionType,
} from "../types";

/**
 * What a write is known to leave in its result.
 *
 * - `keys`: the fields the write set, unioned across chained calls.
 * - `gone`: the fields `.unset()` removed.
 * - `mode`: how the data was written. `full` is the whole record (CREATE and
 *   RELATE `.content()`), so the result is the table's row. `set` keeps the
 *   written fields. `replace` replaces the record. `patch` says nothing about
 *   the fields.
 */
export type WriteShape = {
	/** Fields the write certainly sets. */
	keys: string;
	/** Fields the write may set: they are optional, or may be `undefined`. */
	maybe: string;
	gone: string;
	mode: "full" | "set" | "replace" | "patch";
};

/** Before any data is written: the write is a SET with nothing in it. */
export type NoWrite = { keys: never; maybe: never; gone: never; mode: "set" };

/** A write of the whole record, whose result is the table's row. */
export type FullWrite = {
	keys: never;
	maybe: never;
	gone: never;
	mode: "full";
};

/**
 * The keys of `D` that are certainly written: required, and not typed to accept
 * `undefined`. A key that is optional, or may be `undefined`, may be absent from
 * the record.
 */
type Definite<D> = Exclude<
	{
		// biome-ignore lint/complexity/noBannedTypes: `{}` here means any object type with no required keys, which is the point of the check
		[K in keyof D]-?: {} extends Pick<D, K>
			? never
			: undefined extends D[K]
				? never
				: K;
	}[keyof D] &
		string,
	`${string}.${string}`
>;

/**
 * The top-level field a dotted key (`"name.first"`) writes into. Setting only
 * part of a nested object leaves the rest as it was, so the field itself is
 * only a maybe.
 */
type RootOf<K extends string> = K extends `${infer Root}.${string}` ? Root : K;

/** The keys of `D` that may be absent from the record: see {@link Definite}. */
type Maybe<D> = RootOf<Exclude<keyof D & string, Definite<D>>>;

/**
 * The shape after `D` is written with `mode`, keeping what was written before.
 * A key written both ways is certainly written.
 */
export type Written<
	W extends WriteShape,
	Mode extends WriteShape["mode"],
	D,
> = {
	keys: W["keys"] | Definite<D>;
	maybe: Exclude<W["maybe"] | Maybe<D>, W["keys"] | Definite<D>>;
	gone: W["gone"];
	mode: Mode;
};

/** Which write query produced the result. */
export type WriteKind = "create" | "update" | "relate";

/** Fields with a `.default()`, which CREATE fills in. */
type DefaultKeys<S, W extends WriteShape> = Exclude<
	{
		[K in keyof S]-?: S[K] extends HasDefault ? K : never;
	}[keyof S],
	W["maybe"]
>;

/** Fields that may be absent: `option<…>` fields. */
type OptionKeys<S extends Record<string, AbstractType>> = {
	[K in keyof S]-?: undefined extends S[K]["infer"] ? K : never;
}[keyof S];

type Implicit<K extends WriteKind> = K extends "relate"
	? "id" | "in" | "out"
	: "id";

/**
 * The fields a write is known to leave present. Computed fields are always
 * present, since the database evaluates them on every write.
 */
type Guaranteed<
	S extends Record<string, AbstractType>,
	W extends WriteShape,
	K extends WriteKind,
> = Exclude<
	| Implicit<K>
	| ComputedKeys<S>
	| (W["mode"] extends "patch" ? never : W["keys"])
	| (W["mode"] extends "set"
			? K extends "update"
				? never
				:
						| OptionKeys<S>
						| (K extends "create" | "relate" ? DefaultKeys<S, W> : never)
			: never)
	| (W["mode"] extends "replace"
			? K extends "update"
				? never
				: OptionKeys<S>
			: never),
	W["gone"] | W["maybe"]
> &
	keyof S;

/**
 * Whether the fields the write does not guarantee may still be present. A
 * partial UPDATE or UPSERT leaves the stored values in place, and a PATCH can
 * set anything, so those fields are optional. A CREATE or RELATE only has the
 * fields it wrote, so the rest are absent.
 */
type MayRemain<
	W extends WriteShape,
	K extends WriteKind,
> = W["mode"] extends "patch"
	? true
	: K extends "update"
		? W["mode"] extends "set"
			? true
			: false
		: false;

/**
 * The fields that may be absent: every field the write does not guarantee where
 * the stored record may keep the rest, otherwise the fields that may be unset.
 */
type OptionalFields<
	S extends Record<string, AbstractType>,
	W extends WriteShape,
	K extends WriteKind,
> =
	MayRemain<W, K> extends true
		? Exclude<keyof S, Guaranteed<S, W, K> | W["gone"]>
		: Exclude<Extract<W["maybe"], keyof S>, W["gone"]>;

type RowFields<
	S extends Record<string, AbstractType>,
	W extends WriteShape,
	K extends WriteKind,
> = { [P in Guaranteed<S, W, K>]: S[P] } & {
	[P in OptionalFields<S, W, K>]: OptionType<S[P]>;
};

/**
 * The type of the rows a write returns. Only the fields the write guarantees are
 * required. The rest are optional where the stored record may still have them,
 * and absent otherwise. A `full` write returns the table's row unchanged. A
 * table linked to a class keeps the class's members.
 */
export type WriteRow<
	E extends AbstractType,
	W extends WriteShape,
	K extends WriteKind,
> = W["mode"] extends "full"
	? E
	: E extends {
				readonly model: unknown;
				readonly schema: infer S extends Record<string, AbstractType>;
				readonly infer: infer I;
			}
		? ModelType<RowFields<S, W, K>, Omit<I, keyof S>>
		: E extends {
					readonly schema: infer S extends Record<string, AbstractType>;
				}
			? ObjectType<RowFields<S, W, K>>
			: E;

/**
 * Parse the rows of a write result leniently. Only the fields the database
 * returned are checked, so a field the write did not set is not an error. A
 * field that is present is parsed by its type, as usual. A table linked to a
 * class still yields instances of that class, as a select does.
 */
export function parseWritten(type: AbstractType, value: unknown): unknown {
	// A tuple (a projection such as `[in, out]`) is one value, not a list of rows.
	if (type instanceof ArrayType && Array.isArray(type.schema)) {
		return type.parse(value);
	}
	if (type instanceof ArrayType) {
		if (!Array.isArray(value)) return type.parse(value);
		const row = type.schema as AbstractType;
		return value.map((item) => parseRow(row, item));
	}
	if (Array.isArray(value)) {
		throw new TypeParseError(type.name, type.expected, value);
	}
	return parseRow(type, value);
}

function parseRow(type: AbstractType, value: unknown): unknown {
	if (value === undefined || value === null) return value;
	if (!(type instanceof ObjectType) || typeof value !== "object") {
		return type.parse(value);
	}
	const source = value as Record<string, unknown>;
	const result: Record<string, unknown> = { ...source };
	const schema = type.schema as Record<string, AbstractType>;
	for (const key in schema) {
		if (source[key] !== undefined) {
			result[key] = schema[key]!.parse(source[key]);
		}
	}
	return type instanceof ModelType
		? Object.assign(Object.create(type.model.prototype), result)
		: result;
}
