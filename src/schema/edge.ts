import type { CreateInput, WriteData } from "../query/modification-methods";
import {
	type AbstractType,
	type ObjectType,
	type RecordType,
	t,
} from "../types";
import {
	type SafeParseResult,
	safeParseWith,
	throwIfInvalid,
	type ValidationMode,
} from "../validation";
import type { EventOptions } from "./ddl/event-ddl";
import type { IndexOptions } from "./ddl/index-ddl";
import {
	patchTableDdl,
	type TableDdl,
	type TablePermissions,
} from "./ddl/table-ddl";
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

	/** Schema metadata used to generate `DEFINE TABLE … TYPE RELATION`. */
	readonly ddl: Readonly<TableDdl> = {};

	// An edge is immutable, so what it derives from its fields is built once.
	private _fieldsCache?: Fd & {
		id: RecordType<Tb>;
		in: RecordType<From>;
		out: RecordType<To>;
	} & {};
	private _schemaCache?: GetEdgeSchemaType<From, Tb, To, Fd>;

	get fields(): Fd & {
		id: RecordType<Tb>;
		in: RecordType<From>;
		out: RecordType<To>;
	} & {} {
		if (!this._fieldsCache) {
			this._fieldsCache = {
				...this._fields,
				// A schema that declares its own `id` keeps it. `in` and `out` define
				// the edge, so they follow the declared fields and cannot be changed.
				...("id" in this._fields ? {} : { id: t.record(this.tb) }),
				in: t.record(this.from),
				out: t.record(this.to),
			} as Fd & {
				id: RecordType<Tb>;
				in: RecordType<From>;
				out: RecordType<To>;
			} & {};
		}
		return this._fieldsCache;
	}

	type = undefined as unknown as GetEdgeInferType<From, Tb, To, Fd>;

	get schema(): GetEdgeSchemaType<From, Tb, To, Fd> {
		if (!this._schemaCache) this._schemaCache = t.object(this.fields);
		return this._schemaCache;
	}

	/** Type-guard that checks whether a value matches this edge's schema. */
	validate(value: unknown): value is GetEdgeInferType<From, Tb, To, Fd> {
		return this.schema.validate(value);
	}

	// -------------------------------------------------------------------------
	// Schema modifiers — see the note on TableSchema; each returns a clone.
	// -------------------------------------------------------------------------

	/** Enforce the declared fields, rejecting anything else. This is the default. */
	schemafull(): this {
		return patchTableDdl(this, (d) => {
			d.schemafull = true;
		});
	}

	/** Allow fields beyond those declared. */
	schemaless(): this {
		return patchTableDdl(this, (d) => {
			d.schemafull = false;
		});
	}

	/**
	 * Reject edges whose `in` or `out` record does not exist (`ENFORCED`).
	 *
	 * Without this SurrealDB will happily create an edge pointing at nothing.
	 */
	enforced(): this {
		return patchTableDdl(this, (d) => {
			d.enforced = true;
		});
	}

	/**
	 * Set the edge table's `PERMISSIONS`: a SurrealQL clause as a string, or a
	 * rule per operation, each `"full"`, `"none"`, SurrealQL, or a typed
	 * condition built with `where()` over the edge's fields (`in` and `out`
	 * included).
	 */
	permissions(
		rules: TablePermissions<GetEdgeSchemaType<From, Tb, To, Fd>>,
	): this {
		return patchTableDdl(this, (d) => {
			d.permissions = rules as TablePermissions;
		});
	}

	/** Retain a change feed for `duration` (e.g. `"3d"`). */
	changefeed(duration: string, includeOriginal = false): this {
		return patchTableDdl(this, (d) => {
			d.changefeed = { duration, includeOriginal };
		});
	}

	/** Attach a `COMMENT` to the edge table. */
	comment(text: string): this {
		return patchTableDdl(this, (d) => {
			d.comment = text;
		});
	}

	/**
	 * Add an index.
	 *
	 * @param name - The index name
	 * @param options - What to index and how
	 */
	index(name: string, options: IndexOptions): this {
		return patchTableDdl(this, (d) => {
			d.indexes = { ...d.indexes, [name]: options };
		});
	}

	/**
	 * Add an event.
	 *
	 * @param name - The event name
	 * @param options - What fires it and what it does
	 */
	event(name: string, options: EventOptions): this {
		return patchTableDdl(this, (d) => {
			d.events = { ...d.events, [name]: options };
		});
	}

	/**
	 * Check `data` against this edge's schema without throwing, listing
	 * every field that fails rather than only the first. The `mode` says what
	 * the data is: `"create"` (default) is the input of a create or insert,
	 * where fields with a `.default()` or of type `option<...>` may be left out
	 * and `id`, `in` and `out` are not required; `"update"` is a partial write; `"row"` is a whole stored
	 * record. On success, `data` is typed accordingly.
	 *
	 * The data is returned as given: validation does not convert it.
	 */
	safeParse(
		data: unknown,
		options?: { mode?: "create" },
	): SafeParseResult<
		Omit<CreateInput<GetEdgeSchemaType<From, Tb, To, Fd>>, "in" | "out">
	>;
	safeParse(
		data: unknown,
		options: { mode: "update" },
	): SafeParseResult<Partial<WriteData<GetEdgeSchemaType<From, Tb, To, Fd>>>>;
	safeParse(
		data: unknown,
		options: { mode: "row" },
	): SafeParseResult<GetEdgeInferType<From, Tb, To, Fd>>;
	safeParse(
		data: unknown,
		options: { mode?: ValidationMode } = {},
	): SafeParseResult<unknown> {
		return safeParseWith(
			this.schema,
			data,
			options.mode ?? "create",
			this.tb,
			["id", "in", "out"],
			[],
		);
	}

	/**
	 * Like {@link EdgeSchema.safeParse}, but returns the typed data or throws.
	 *
	 * @throws {ValidationError} Listing every field that fails.
	 */
	parse(
		data: unknown,
		options?: { mode?: "create" },
	): Omit<CreateInput<GetEdgeSchemaType<From, Tb, To, Fd>>, "in" | "out">;
	parse(
		data: unknown,
		options: { mode: "update" },
	): Partial<WriteData<GetEdgeSchemaType<From, Tb, To, Fd>>>;
	parse(
		data: unknown,
		options: { mode: "row" },
	): GetEdgeInferType<From, Tb, To, Fd>;
	parse(data: unknown, options: { mode?: ValidationMode } = {}): unknown {
		const result = this.safeParse(data, options as { mode: "row" });
		if (!result.success) throwIfInvalid(result.error.issues, this.tb);
		return data;
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
