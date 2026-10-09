import { escapeIdent, toSurqlString } from "surrealdb";
import { OrmError } from "../error";
import type { CreateInput, WriteData } from "../query/modification-methods";
import {
	type AbstractType,
	type ObjectType,
	type RecordType,
	t,
} from "../types";
import {
	__ctx,
	__display,
	__type,
	displayContext,
	type Workable,
	type WorkableContext,
} from "../utils";
import { type Actionable, actionable } from "../utils/actionable";
import { type ModelClass, registerModelClass } from "../utils/model";
import {
	type SafeParseResult,
	safeParseWith,
	type ValidationMode,
} from "../validation";
import { ModelType } from "./model-type";
import type { Orm } from "./orm";

export type { ModelClass } from "../utils/model";

/**
 * Marks a field type as a computed (read-only) field. The brand exists only at
 * the type level: a computed field is part of the table's row type (and so of
 * select results), but is left out of every create / update / insert input type.
 */
export type Computed<T extends AbstractType> = T & {
	readonly "~computed": true;
};

/** The names of the computed fields in a field map. */
export type ComputedKeys<F> = {
	[K in keyof F]: F[K] extends { readonly "~computed": true } ? K : never;
}[keyof F];

/**
 * The expression of a computed field. It receives the row being computed
 * (rendered as `$this`) and the ORM, to build subqueries, and returns an
 * expression whose type matches the field's declared type.
 */
export type ComputedExpression<
	Tb extends string,
	Fd extends TableFields,
	T extends AbstractType,
> = (
	// A table whose fields are not known (an index signature: `TableFields`,
	// `any`) gets an `unknown` row. This keeps `TableSchema<"user", {...}>`
	// assignable to such a wider table: the callback takes the row, so a
	// precisely typed row there would make the table invariant in its fields.
	row: string extends keyof Fd
		? unknown
		: Actionable<WorkableContext, ObjectType<Fd & { id: RecordType<Tb> }>>,
	// biome-ignore lint/suspicious/noExplicitAny: the expression may query any registered table
	db: Orm<any>,
) => Workable<WorkableContext, T>;

/** Render a value as a SurrealQL literal: a `DEFINE` statement takes no parameters. */
const inlineValue = (value: unknown): string =>
	typeof value === "string" ? JSON.stringify(value) : toSurqlString(value);

type ComputedDefinition = {
	readonly type: AbstractType;
	readonly expression: (row: never, db: never) => Workable;
};

/** A record mapping field names (excluding `id`) to their type definitions. */
export type TableFields = Record<Exclude<string, "id">, AbstractType>;

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
	// biome-ignore lint/suspicious/noExplicitAny: widest default so any table, class-linked or not, is assignable to a bare `TableSchema`
	Fd extends TableFields = any,
	// biome-ignore lint/suspicious/noExplicitAny: ditto
	I = any,
> {
	constructor(
		public readonly tb: Tb,
		public readonly _fields: Fd,
		public readonly model?: ModelClass,
		private readonly _computed: Readonly<
			Record<string, ComputedDefinition>
		> = {},
	) {
		if (model) registerModelClass(model);
	}

	/**
	 * Add a computed field: a read-only field whose value SurrealDB derives from
	 * an expression each time the record is read (`DEFINE FIELD … COMPUTED`,
	 * SurrealDB 3.0+). It is part of the row type returned by selects, but cannot
	 * be written: it is left out of the input types of `create`, `update`,
	 * `upsert`, `insert` and `relate`.
	 *
	 * The field must exist in the database before it can be read. Create it with
	 * {@link Orm.defineComputed}, or run {@link TableSchema.computedStatements}
	 * in a migration.
	 *
	 * @param name - The field name.
	 * @param type - The type of the computed value.
	 * @param expression - Builds the expression from the row and the ORM.
	 *
	 * @example
	 * ```ts
	 * const user = table("user", { name: t.string() }).computed(
	 *   "postCount",
	 *   t.number(),
	 *   (user, db) =>
	 *     db
	 *       .select("post")
	 *       .where((p) => p.author.eq(user.id))
	 *       .return((p) => p.id)
	 *       .wrap()
	 *       .len(),
	 * );
	 * ```
	 */
	computed<const N extends string, T extends AbstractType>(
		name: N extends "id" | keyof Fd ? never : N,
		type: T,
		expression: ComputedExpression<Tb, Fd, T>,
	): TableSchema<Tb, Fd & { [K in N]: Computed<T> }, I> {
		if (name === "id" || name in this._fields || name in this._computed) {
			throw new OrmError(
				`Field "${name}" is already defined on table "${this.tb}"`,
			);
		}

		return new TableSchema(
			this.tb,
			{ ...this._fields, [name]: type } as unknown as Fd & {
				[K in N]: Computed<T>;
			},
			this.model,
			{
				...this._computed,
				[name]: { type, expression } as ComputedDefinition,
			},
		);
	}

	/** The names of this table's computed fields. */
	get computedFields(): string[] {
		return Object.keys(this._computed);
	}

	/**
	 * Render a `DEFINE FIELD OVERWRITE … COMPUTED …` statement for each computed
	 * field. Values are inlined, because a `DEFINE` statement cannot take
	 * parameters.
	 *
	 * @param orm - The ORM the expressions are built against.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: accepts an ORM over any tables
	computedStatements(orm: Orm<any>): string[] {
		return Object.entries(this._computed).map(([name, def]) => {
			const id = Symbol();
			const row = actionable({
				[__ctx]: { orm, id } as WorkableContext,
				[__type]: this.schema,
				[__display]: ({ contextId }) =>
					contextId === id ? "$this" : "$parent",
			});
			const expression = (
				def.expression as (r: unknown, db: unknown) => Workable
			)(row, orm);
			const sql = expression[__display](
				displayContext({ var: inlineValue, variables: {}, contextId: id }),
			);
			return `DEFINE FIELD OVERWRITE ${escapeIdent(name)} ON TABLE ${escapeIdent(this.tb)} COMPUTED (${sql})`;
		});
	}

	// A table is immutable (`computed()` returns a new one), so what it derives
	// from its fields is built once. Rebuilding it on every access made each
	// query rebuild a whole object type per property lookup.
	private _fieldsCache?: Fd & { id: RecordType<Tb> } & {};
	private _schemaCache?: GetSchemaType<Tb, Fd, I>;

	get fields(): Fd & { id: RecordType<Tb> } & {} {
		if (!this._fieldsCache) {
			this._fieldsCache = {
				...this._fields,
				id: t.record(this.tb as string),
			} as Fd & { id: RecordType<Tb> } & {};
		}
		return this._fieldsCache;
	}

	type = undefined as unknown as GetInferType<Tb, Fd, I>;

	get schema(): GetSchemaType<Tb, Fd, I> {
		if (!this._schemaCache) {
			this._schemaCache = (this.model
				? new ModelType(this.fields, this.model)
				: t.object(this.fields)) as unknown as GetSchemaType<Tb, Fd, I>;
		}
		return this._schemaCache;
	}

	/** Type-guard that checks whether a value matches this table's schema. */
	validate(value: unknown): value is GetInferType<Tb, Fd, I> {
		return this.schema.validate(value);
	}

	/**
	 * Check `data` against this table's schema without throwing, listing
	 * every field that fails rather than only the first. The `mode` says what
	 * the data is: `"create"` (default) is the input of a create or insert,
	 * where fields with a `.default()` or of type `option<...>` may be left out
	 * and computed fields are rejected; `"update"` is a partial write; `"row"` is a whole stored
	 * record. On success, `data` is typed accordingly.
	 *
	 * The data is returned as given: validation does not convert it. The one
	 * exception is `"row"` mode on a table linked to a class, where the data is
	 * hydrated into an instance of the class, as selects do.
	 */
	safeParse(
		data: unknown,
		options?: { mode?: "create" },
	): SafeParseResult<CreateInput<GetSchemaType<Tb, Fd, I>>>;
	safeParse(
		data: unknown,
		options: { mode: "update" },
	): SafeParseResult<Partial<WriteData<GetSchemaType<Tb, Fd, I>>>>;
	safeParse(
		data: unknown,
		options: { mode: "row" },
	): SafeParseResult<GetInferType<Tb, Fd, I>>;
	safeParse(
		data: unknown,
		options: { mode?: ValidationMode } = {},
	): SafeParseResult<unknown> {
		const mode = options.mode ?? "create";
		const result = safeParseWith(
			this.schema,
			data,
			mode,
			this.tb,
			["id"],
			this.computedFields,
		);
		if (result.success && mode === "row" && this.model) {
			return {
				success: true,
				data: Object.assign(
					Object.create(this.model.prototype),
					result.data as object,
				),
			};
		}
		return result;
	}

	/**
	 * Like {@link TableSchema.safeParse}, but returns the typed data or throws.
	 *
	 * @throws {ValidationError} Listing every field that fails.
	 */
	parse(
		data: unknown,
		options?: { mode?: "create" },
	): CreateInput<GetSchemaType<Tb, Fd, I>>;
	parse(
		data: unknown,
		options: { mode: "update" },
	): Partial<WriteData<GetSchemaType<Tb, Fd, I>>>;
	parse(data: unknown, options: { mode: "row" }): GetInferType<Tb, Fd, I>;
	parse(data: unknown, options: { mode?: ValidationMode } = {}): unknown {
		const result = this.safeParse(data, options as { mode: "row" });
		if (!result.success) throw result.error;
		return result.data;
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
	return new TableSchema<
		Tb,
		Fd,
		[M] extends [never] ? unknown : InstanceType<M>
	>(tb, fields, model);
}
