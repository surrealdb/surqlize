import { escapeIdent, toSurqlString } from "surrealdb";
import { OrmError } from "../error";
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
import type { Orm } from "./orm";

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
	row: Actionable<WorkableContext, ObjectType<Fd & { id: RecordType<Tb> }>>,
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

type GetSchemaType<Tb extends string, Fd extends TableFields> = ObjectType<
	Fd & { id: RecordType<Tb> }
>;

type GetInferType<Tb extends string, Fd extends TableFields> = GetSchemaType<
	Tb,
	Fd
>["infer"];

/**
 * Schema definition for a SurrealDB table. Automatically includes a typed `id`
 * field based on the table name. Use the {@link table} factory function to
 * create instances.
 *
 * @typeParam Tb - The table name literal type.
 * @typeParam Fd - The user-defined fields for the table.
 */
export class TableSchema<
	Tb extends string = string,
	Fd extends TableFields = TableFields,
> {
	constructor(
		public readonly tb: Tb,
		public readonly _fields: Fd,
		private readonly _computed: Readonly<
			Record<string, ComputedDefinition>
		> = {},
	) {}

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
	): TableSchema<Tb, Fd & { [K in N]: Computed<T> }> {
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

	get fields(): Fd & { id: RecordType<Tb> } & {} {
		return {
			...this._fields,
			id: t.record(this.tb as string),
		} as Fd & { id: RecordType<Tb> } & {};
	}

	type = undefined as unknown as GetInferType<Tb, Fd>;

	get schema(): GetSchemaType<Tb, Fd> {
		return t.object(this.fields);
	}

	/** Type-guard that checks whether a value matches this table's schema. */
	validate(value: unknown): value is GetInferType<Tb, Fd> {
		return this.schema.validate(value);
	}
}

/**
 * Define a SurrealDB table schema. An `id` field of type `RecordType<Tb>` is
 * automatically added.
 *
 * @param tb - The table name.
 * @param fields - A record of field names to type definitions.
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
>(tb: Tb extends string ? Tb : never, fields: Fd) {
	return new TableSchema(tb, fields);
}
