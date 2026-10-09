import { type AbstractType, ObjectType, type RecordType, t } from "../types";
import { type ModelClass, registerModelClass } from "../utils/model";

export type { ModelClass } from "../utils/model";

/** A record mapping field names (excluding `id`) to their type definitions. */
export type TableFields = Record<Exclude<string, "id">, AbstractType>;

/**
 * The object type of a table linked to a class: rows parse into instances of
 * the class, and the inferred type is the row fields plus the class instance.
 */
export class ModelType<
	Fd extends Record<string, AbstractType> = Record<string, AbstractType>,
	I = unknown,
> extends ObjectType<Fd> {
	declare infer: ObjectType<Fd>["infer"] & I;
	declare accept: ObjectType<Fd>["accept"] & I;

	constructor(
		fields: Fd,
		readonly model: ModelClass,
	) {
		super(fields);
	}

	/** Parse a row, then hydrate it into an instance of the linked class. */
	parse(value: unknown): this["infer"] {
		const row = super.parse(value);
		return Object.assign(Object.create(this.model.prototype), row);
	}
}

type GetSchemaType<
	Tb extends string,
	Fd extends TableFields,
	I = unknown,
> = unknown extends I
	? ObjectType<Fd & { id: RecordType<Tb> }>
	: ModelType<Fd & { id: RecordType<Tb> }, I>;

type GetInferType<
	Tb extends string,
	Fd extends TableFields,
	I = unknown,
> = GetSchemaType<Tb, Fd, I>["infer"];

/**
 * Schema definition for a SurrealDB table. Automatically includes a typed `id`
 * field based on the table name. Use the {@link table} factory function to
 * create instances.
 *
 * @typeParam Tb - The table name literal type.
 * @typeParam Fd - The user-defined fields for the table.
 * @typeParam I - The instance type of the class linked to the table, if any.
 */
export class TableSchema<
	Tb extends string = string,
	// biome-ignore lint/suspicious/noExplicitAny: widest default so any table is assignable to a bare `TableSchema`
	Fd extends TableFields = any,
	// biome-ignore lint/suspicious/noExplicitAny: ditto
	I = any,
> {
	constructor(
		public readonly tb: Tb,
		public readonly _fields: Fd,
		public readonly model?: ModelClass,
	) {
		if (model) registerModelClass(model);
	}

	get fields(): Fd & { id: RecordType<Tb> } & {} {
		return {
			...this._fields,
			id: t.record(this.tb as string),
		} as Fd & { id: RecordType<Tb> } & {};
	}

	type = undefined as unknown as GetInferType<Tb, Fd, I>;

	get schema(): GetSchemaType<Tb, Fd, I> {
		return (this.model
			? new ModelType(this.fields, this.model)
			: t.object(this.fields)) as unknown as GetSchemaType<Tb, Fd, I>;
	}

	/** Type-guard that checks whether a value matches this table's schema. */
	validate(value: unknown): value is GetInferType<Tb, Fd, I> {
		return this.schema.validate(value);
	}
}

/**
 * Define a SurrealDB table schema. An `id` field of type `RecordType<Tb>` is
 * automatically added.
 *
 * @param tb - The table name.
 * @param fields - A record of field names to type definitions.
 * @param model - Optionally, a class to link to the table. Rows read from the
 *   table are then instances of the class (so its methods and getters are
 *   available), and instances of it are accepted as record content. The class
 *   constructor is not run when hydrating a row.
 * @returns A {@link TableSchema} instance.
 *
 * @example
 * ```ts
 * const user = table("user", {
 *   name: t.string(),
 *   age: t.number(),
 *   email: t.string(),
 * });
 * ```
 */
export function table<
	Tb extends string,
	Fd extends Record<Exclude<string, "id">, AbstractType>,
	M extends ModelClass = never,
>(
	tb: Tb extends string ? Tb : never,
	fields: Fd,
	model?: M,
): TableSchema<Tb, Fd, [M] extends [never] ? unknown : InstanceType<M>> {
	return new TableSchema(tb, fields, model);
}
