import {
	type AbstractType,
	type ObjectType,
	type RecordType,
	t,
} from "../types";
/** A record mapping field names (excluding `id`, `in`, `out`) to their type definitions. */
export type EdgeFields = Record<
	Exclude<string, "id" | "in" | "out">,
	AbstractType
>;

type GetEdgeSchemaType<
	From extends string,
	Tb extends string,
	To extends string,
	Fd extends EdgeFields,
> = ObjectType<
	Fd & {
		id: RecordType<Tb>;
		in: RecordType<From>;
		out: RecordType<To>;
	}
>;

type GetEdgeInferType<
	From extends string,
	Tb extends string,
	To extends string,
	Fd extends EdgeFields,
> = GetEdgeSchemaType<From, Tb, To, Fd>["infer"];

/**
 * Schema definition for a SurrealDB edge (graph relationship) table.
 * Automatically includes typed `id`, `in`, and `out` fields. Use the
 * {@link edge} factory function to create instances.
 *
 * @typeParam From - The source table name, or a union of names.
 * @typeParam Tb - The edge table name.
 * @typeParam To - The target table name, or a union of names.
 * @typeParam Fd - The user-defined fields for the edge.
 */
export class EdgeSchema<
	From extends string = string,
	Tb extends string = string,
	To extends string = string,
	Fd extends EdgeFields = EdgeFields,
> {
	constructor(
		public readonly from: From | readonly From[],
		public readonly tb: Tb,
		public readonly to: To | readonly To[],
		public readonly _fields: Fd,
	) {}

	get fields(): Fd & {
		id: RecordType<Tb>;
		in: RecordType<From>;
		out: RecordType<To>;
	} & {} {
		return {
			...this._fields,
			id: t.record(this.tb),
			in: t.record(this.from),
			out: t.record(this.to),
		} as Fd & {
			id: RecordType<Tb>;
			in: RecordType<From>;
			out: RecordType<To>;
		} & {};
	}

	type = undefined as unknown as GetEdgeInferType<From, Tb, To, Fd>;

	get schema(): GetEdgeSchemaType<From, Tb, To, Fd> {
		return t.object(this.fields);
	}

	/** Type-guard that checks whether a value matches this edge's schema. */
	validate(value: unknown): value is GetEdgeInferType<From, Tb, To, Fd> {
		return this.schema.validate(value);
	}
}

/**
 * Define a SurrealDB edge (graph relationship) table schema. Fields `id`, `in`,
 * and `out` are automatically added with the appropriate record types.
 *
 * @param from - The source table name, or an array of names for an edge that
 *   may originate from any of several tables (`in` becomes `record<a | b>`).
 * @param tb - The edge table name.
 * @param to - The target table name, or an array of names for an edge that may
 *   point at any of several tables (`out` becomes `record<a | b>`).
 * @param fields - A record of additional field names to type definitions.
 * @returns An {@link EdgeSchema} instance.
 *
 * @example
 * ```ts
 * const authored = edge("user", "authored", "post", {
 *   created: t.date(),
 * });
 *
 * // An edge whose source may be a post or a user:
 * const tagged = edge(["post", "user"], "tagged", "tag", {});
 * ```
 */
export function edge<
	const From extends string,
	Tb extends string,
	const To extends string,
	Fd extends Record<Exclude<string, "id" | "in" | "out">, AbstractType>,
>(
	from: From | readonly From[],
	tb: Tb extends string ? Tb : never,
	to: To | readonly To[],
	fields: Fd,
): EdgeSchema<From, Tb, To, Fd> {
	return new EdgeSchema<From, Tb, To, Fd>(from, tb, to, fields);
}
