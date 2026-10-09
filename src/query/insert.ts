import { escapeIdent, Table } from "surrealdb";
import { OrmError } from "../error.ts";
import type { Orm } from "../schema/orm.ts";
import type { ComputedKeys } from "../schema/table.ts";
import { type AbstractType, type ArrayType, ObjectType, t } from "../types";
import { type Actionable, actionable } from "../utils/actionable.ts";
import { type DisplayContext, displayContext } from "../utils/display.ts";
import {
	type Inheritable,
	type InheritableIntoType,
	inheritableIntoWorkable,
} from "../utils/inheritable.ts";
import {
	__ctx,
	__display,
	__type,
	sanitizeWorkable,
	type Workable,
	type WorkableContext,
} from "../utils/workable.ts";
import {
	checkRecord,
	checkSet,
	throwIfInvalid,
	type ValidationIssue,
} from "../validation.ts";
import { Query } from "./abstract.ts";
import {
	fillData,
	fillValues,
	renderData,
	schemaDefaults,
} from "./defaults.ts";
import {
	generateSetAssignments,
	processSetOperators,
	renderValue,
	type SetValue,
} from "./utils.ts";
import { computedFieldsOf, implicitFieldsOf } from "./validate-input.ts";
import type { FullWrite, WriteRow, WriteShape } from "./write-result.ts";

type SetData<T extends ObjectType> = {
	[K in Exclude<keyof T["schema"], ComputedKeys<T["schema"]>>]?: SetValue<
		T["schema"][K]
	>;
};

/**
 * A fluent INSERT query builder. Supports inline data, `.fields().values()`,
 * IGNORE, ON DUPLICATE KEY UPDATE, RETURN, and TIMEOUT clauses.
 */
export class InsertQuery<
	O extends Orm,
	C extends WorkableContext<O>,
	T extends keyof O["tables"] & string,
	E extends AbstractType = O["tables"][T]["schema"],
	W extends WriteShape = FullWrite,
> extends Query<C, ArrayType<WriteRow<E, W, "create">>> {
	readonly [__ctx]: C;
	private _data?: unknown | unknown[];
	private _fields?: string[];
	private _values?: unknown[][];
	private _ignore?: boolean;
	private _onDuplicate?: Record<string, unknown>;
	private _return?: "none" | "before" | "after" | "diff" | Workable<C, E>;
	private _timeout?: string;

	constructor(
		orm: O,
		readonly tb: T,
		data?: unknown | unknown[],
	) {
		super();
		this[__ctx] = {
			orm,
			id: Symbol(),
		} as C;
		this._data = data;
	}

	get schema(): E {
		return this[__ctx].orm.tables[this.tb]!.schema as unknown as E;
	}

	get [__type](): ArrayType<WriteRow<E, W, "create">> {
		if (this._return && typeof this._return !== "string") {
			return t.array(this._return[__type]) as ArrayType<
				WriteRow<E, W, "create">
			>;
		}
		return t.array(this.schema) as ArrayType<WriteRow<E, W, "create">>;
	}

	/**
	 * Specify the fields for a `VALUES`-style insert.
	 *
	 * @param fields - Column names to insert into.
	 * @throws {OrmError} If the query was constructed with inline data.
	 */
	fields(
		fields: E extends ObjectType
			? Exclude<keyof E["schema"], ComputedKeys<E["schema"]>>[]
			: string[],
	): this {
		if (this._data) {
			throw new OrmError("Cannot use fields() with object-style insert");
		}
		const fields_ = fields as string[];
		return this.derive((next) => {
			next._fields = fields_;
		});
	}

	/**
	 * Provide value rows for a `VALUES`-style insert.
	 *
	 * @param rows - One or more arrays of values matching the field order.
	 * @throws {OrmError} If the query was constructed with inline data.
	 * @throws {OrmError} If {@link fields} has not been called first.
	 * @throws {OrmError} If any row length does not match the field count.
	 */
	values(...rows: unknown[][]): this {
		if (this._data) {
			throw new OrmError("Cannot use values() with object-style insert");
		}
		if (!this._fields) {
			throw new OrmError("Must call fields() before values()");
		}

		// Validate each row has the correct number of values
		for (const row of rows) {
			if (row.length !== this._fields.length) {
				throw new OrmError(
					`Value row length (${row.length}) does not match fields length (${this._fields.length})`,
				);
			}
		}

		return this.derive((next) => {
			next._values = [...(next._values ?? []), ...rows];
		});
	}

	/**
	 * Add an `IGNORE` clause so duplicate records are silently skipped.
	 *
	 * @throws {OrmError} If {@link onDuplicate} has already been called.
	 */
	ignore(): this {
		if (this._onDuplicate) {
			throw new OrmError("Cannot use both ignore() and onDuplicate()");
		}
		return this.derive((next) => {
			next._ignore = true;
		});
	}

	/**
	 * Add an `ON DUPLICATE KEY UPDATE` clause.
	 *
	 * A row that conflicts is updated, not inserted, so the rows returned may be
	 * records the update did not fully write. Only the id is typed as present.
	 *
	 * @param updates - Fields and values to update on conflict.
	 * @throws {OrmError} If {@link ignore} has already been called.
	 */
	onDuplicate(
		updates: E extends ObjectType
			? Partial<SetData<E>>
			: Record<string, unknown>,
	): InsertQuery<
		O,
		C,
		T,
		E,
		{ keys: never; maybe: never; gone: never; mode: "patch" }
	> {
		if (this._ignore) {
			throw new OrmError("Cannot use both ignore() and onDuplicate()");
		}

		const processedData = processSetOperators(
			updates as Record<string, unknown>,
		);
		return this.derive((next) => {
			next._onDuplicate = processedData;
			next._lenient = true;
		}) as unknown as InsertQuery<
			O,
			C,
			T,
			E,
			{ keys: never; maybe: never; gone: never; mode: "patch" }
		>;
	}

	return(mode: "none" | "before" | "after" | "diff"): this;
	return<
		P extends Inheritable<C>,
		R extends InheritableIntoType<C, P> = InheritableIntoType<C, P>,
	>(cb: (tb: Actionable<C, E>) => P): InsertQuery<O, C, T, R>;
	return(
		value:
			| "none"
			| "before"
			| "after"
			| "diff"
			| ((tb: Actionable<C, E>) => Inheritable<C>),
	): unknown {
		if (typeof value === "function") {
			const tb = actionable({
				[__ctx]: this[__ctx],
				[__type]: this.schema,
				[__display]: ({ contextId }) => {
					return contextId === this[__ctx].id ? "$this" : "$parent";
				},
			}) as Actionable<C, E>;

			const predicable = value(tb);
			const workable = inheritableIntoWorkable<C, typeof predicable>(
				predicable,
			) as unknown as Workable<C, E>;
			const ret = sanitizeWorkable(workable);
			return this.derive((next) => {
				next._return = ret;
			});
		}
		const mode = value;
		return this.derive((next) => {
			next._return = mode;
			next._skipParse = mode === "diff";
		});
	}

	timeout(duration: string): this {
		return this.derive((next) => {
			next._timeout = duration;
		});
	}

	protected override validateInput(): void {
		const schema = this.schema;
		if (!(schema instanceof ObjectType)) return;
		const orm = this[__ctx].orm;
		const options = {
			mode: "create" as const,
			implicit: implicitFieldsOf(orm, this.tb),
			computed: computedFieldsOf(orm, this.tb),
		};
		const issues: ValidationIssue[] = [];

		if (this._data !== undefined) {
			if (Array.isArray(this._data)) {
				this._data.forEach((row, i) => {
					issues.push(...checkRecord(schema, row, options, `[${i}]`));
				});
			} else {
				issues.push(...checkRecord(schema, this._data, options));
			}
		} else if (this._fields && this._values) {
			const fields = this._fields;
			this._values.forEach((values, i) => {
				const row = Object.fromEntries(fields.map((f, j) => [f, values[j]]));
				issues.push(...checkRecord(schema, row, options, `[${i}]`));
			});
		}
		if (this._onDuplicate) {
			issues.push(...checkSet(schema, this._onDuplicate, options.computed));
		}

		throwIfInvalid(issues, this.tb);
	}

	[__display](inp: DisplayContext) {
		const ctx = displayContext({
			...inp,
			contextId: this[__ctx].id,
		});

		const table = ctx.var(new Table(this.tb));

		let query = /* surql */ "INSERT";
		if (this._ignore) query += /* surql */ " IGNORE";
		query += /* surql */ ` INTO ${table}`;

		// Object-style syntax
		const defaults = schemaDefaults(this.schema);
		if (this._data) {
			query += /* surql */ ` ${renderData(fillData(this._data, defaults), ctx)}`;
		}

		// VALUES tuple syntax
		else if (this._fields && this._values) {
			const filled = fillValues(this._fields, this._values, defaults);
			query += /* surql */ ` (${filled.fields.map(escapeIdent).join(", ")})`;
			const valueGroups = filled.rows.map(
				(row) => `(${row.map((v) => renderValue(v, ctx)).join(", ")})`,
			);
			query += /* surql */ ` VALUES ${valueGroups.join(", ")}`;
		}

		// ON DUPLICATE KEY UPDATE
		if (this._onDuplicate) {
			const assignments = generateSetAssignments(this._onDuplicate, ctx);
			query += /* surql */ ` ON DUPLICATE KEY UPDATE ${assignments.join(", ")}`;
		}

		// RETURN clause
		if (this._return) {
			if (typeof this._return === "string") {
				query += /* surql */ ` RETURN ${this._return.toUpperCase()}`;
			} else {
				query += /* surql */ ` RETURN VALUE ${this._return[__display](ctx)}`;
			}
		}

		// TIMEOUT
		if (this._timeout) {
			query += /* surql */ ` TIMEOUT ${ctx.var(this._timeout)}`;
		}

		return `(${query})`;
	}
}
