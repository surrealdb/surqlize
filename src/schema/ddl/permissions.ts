import { RecordId } from "surrealdb";
import { OrmError } from "../../error";
import {
	type AbstractType,
	type AnyType,
	type ObjectType,
	type OptionType,
	RecordType,
	type StringType,
	t,
} from "../../types";
import {
	__ctx,
	__display,
	__type,
	displayContext,
	inlineValue,
	type Workable,
	type WorkableContext,
} from "../../utils";
import { type Actionable, actionable } from "../../utils/actionable";
import type { AnyTable, Orm } from "../orm";
import { simplifyCondition } from "./condition";

/**
 * Typed permission rules.
 *
 * A rule is either a string (SurrealQL as written: `"FULL"`, `"NONE"`, or a
 * condition), or a {@link where} rule: an expression built from the row and the
 * variables SurrealDB provides to a permission clause (`$auth`, `$session`,
 * `$token`, `$access`, and for a field `$value`, `$before` and `$after`).
 *
 * A typed rule is rendered to SurrealQL when the schema is generated, not when
 * it is declared, so it can resolve record links against the tables that exist.
 */

/** The operations a table's permissions are given for. */
export const TABLE_OPERATIONS = [
	"select",
	"create",
	"update",
	"delete",
] as const;

/** The operations a field's permissions are given for: a field has no `delete`. */
export const FIELD_OPERATIONS = ["select", "create", "update"] as const;

export type TableOperation = (typeof TABLE_OPERATIONS)[number];
export type FieldOperation = (typeof FIELD_OPERATIONS)[number];

/**
 * A row whose fields are not known: every property is reachable, and none is
 * typed. It is what a field's rule sees, since the table does not exist yet
 * where the field is declared.
 */
export type LooseRow = ObjectType<Record<string, AnyType>> & {
	readonly "~loose": true;
};

/** The row a rule receives: typed from its table, or loose. */
type RowActionable<
	C extends WorkableContext,
	Row extends AbstractType,
> = Row extends LooseRow
	? // biome-ignore lint/suspicious/noExplicitAny: a loose row answers to any property
		Record<string, any>
	: Actionable<C, Row>;

/** A link to any table, which also takes `undefined` to compare against. */
// biome-ignore lint/suspicious/noExplicitAny: a link to any table
type LooseRecord = RecordType<any> & { readonly infer: any };

/** What a session knows about itself (`$session`). */
export type SessionType = ObjectType<{
	ac: OptionType<StringType>;
	db: OptionType<StringType>;
	ns: OptionType<StringType>;
	id: OptionType<StringType>;
	ip: OptionType<StringType>;
	or: OptionType<StringType>;
	rd: OptionType<RecordType<undefined>>;
	exp: OptionType<AnyType>;
}>;

/** The claims of the token the session was opened with (`$token`): any property. */
export type TokenType = LooseRow;

/**
 * The authenticated record when nothing says which table it comes from: its
 * `id` is a record link, and any other property is untyped.
 */
export type LooseAuthType = ObjectType<
	{ id: LooseRecord } & Record<string, AnyType>
>;

/**
 * The variables a permission rule can read.
 *
 * `value`, `before` and `after` exist in a field's permissions only; in a
 * table's they are `NONE`, so reading one there is refused when the schema is
 * generated.
 */
export interface PermissionContext<
	C extends WorkableContext,
	Auth,
	Value extends AbstractType = AnyType,
> {
	/** The record the session is signed in as (`$auth`). */
	readonly auth: Auth;
	/** The session (`$session`). */
	readonly session: Actionable<C, SessionType>;
	/** The claims of the session's token (`$token`). */
	readonly token: RowActionable<C, TokenType>;
	/** The name of the access method the session signed in with (`$access`). */
	readonly access: Actionable<C, OptionType<StringType>>;
	/** The field's value, as it is being read or written (`$value`). Fields only. */
	readonly value: Actionable<C, Value>;
	/** The field's value before the write (`$before`). Fields only. */
	readonly before: Actionable<C, Value>;
	/** The field's value after the write (`$after`). Fields only. */
	readonly after: Actionable<C, Value>;
}

type Scope = "table" | "field";

/** The tables record links resolve against, by name. */
export type RenderTables = Readonly<
	Record<string, { readonly tb: string; readonly schema: AbstractType }>
>;

/** What a rule is rendered against. */
export interface RenderEnvironment {
	/** The table the permissions belong to. */
	tb: string;
	tables: RenderTables;
}

type RuleBuilder = (row: never, ctx: never) => Workable;

/**
 * A condition on the row and the session, built with {@link where}.
 *
 * `Row` is the object type of the row the rule is about, and `Value` the type of
 * the field, when it is a field's. Neither exists at runtime: they let
 * `.permissions()` check the rule against the table it is given to.
 */
export class WhereRule<
	Row extends AbstractType = LooseRow,
	Value extends AbstractType = AnyType,
> {
	declare readonly "~row": Row;
	declare readonly "~value": Value;

	constructor(
		readonly build: RuleBuilder,
		/** The table `auth` is a record of, if it was named. */
		readonly auth?: AnyTable,
		/** Further tables the rule's record links resolve against. */
		readonly related: readonly AnyTable[] = [],
	) {}
}

/** Whether `value` is a {@link where} rule. */
export function isWhereRule(value: unknown): value is WhereRule {
	return value instanceof WhereRule;
}

/** A rule: SurrealQL as written, or a typed condition. */
export type PermissionRule<
	Row extends AbstractType = LooseRow,
	Value extends AbstractType = AnyType,
> = string | WhereRule<Row, Value>;

/** Per-operation rules for a table or edge. */
export interface TablePermissionRules<Row extends AbstractType = LooseRow> {
	select?: PermissionRule<Row>;
	create?: PermissionRule<Row>;
	update?: PermissionRule<Row>;
	delete?: PermissionRule<Row>;
}

/** A table's `PERMISSIONS`: one SurrealQL clause, or a rule per operation. */
export type TablePermissions<Row extends AbstractType = LooseRow> =
	| string
	| TablePermissionRules<Row>;

/** Per-operation rules for a field, which has no `delete`. */
export interface FieldPermissionRules<Value extends AbstractType = AnyType> {
	select?: PermissionRule<LooseRow, Value>;
	create?: PermissionRule<LooseRow, Value>;
	update?: PermissionRule<LooseRow, Value>;
}

/** A field's `PERMISSIONS`: one SurrealQL clause, or a rule per operation. */
export type FieldPermissions<Value extends AbstractType = AnyType> =
	| string
	| FieldPermissionRules<Value>;

/**
 * A condition a record must meet for an operation to be allowed.
 *
 * It receives the row (`$this`) and the session variables, and returns an
 * expression. The row is untyped here unless the rule is handed straight to a
 * table's `.permissions()`, which supplies its row type.
 *
 * @example
 * ```ts
 * table("post", { owner: t.record("user") }).permissions({
 *   select: "full",
 *   update: where((row, { auth }) => row.owner.eq(auth.id)),
 *   delete: "none",
 * });
 * ```
 *
 * To type `auth` as a table's record, use {@link authenticatedAs}.
 */
export function where<
	Row extends AbstractType = LooseRow,
	Value extends AbstractType = AnyType,
>(
	build: (
		row: RowActionable<WorkableContext, Row>,
		ctx: PermissionContext<
			WorkableContext,
			Actionable<WorkableContext, LooseAuthType>,
			Value
		>,
	) => Workable<WorkableContext>,
): WhereRule<Row, Value> {
	return new WhereRule<Row, Value>(build as unknown as RuleBuilder);
}

/**
 * Rules for sessions signed in as a record of `authTable` (the table a
 * `DEFINE ACCESS … TYPE RECORD` signs users in from). Returns a `where` whose
 * `auth` is that record, so `auth.role` is checked against the table's fields.
 *
 * The table is taken as a value, not just a type, so a property of `auth` has the
 * right type at runtime as well (a string's methods, for instance). Pass further
 * tables to let a rule follow links into them.
 *
 * @example
 * ```ts
 * const { where } = authenticatedAs(user);
 *
 * table("post", { owner: t.record("user") }).permissions({
 *   update: where((row, { auth }) => row.owner.eq(auth.id).or(auth.role.eq("admin"))),
 * });
 * ```
 */
export function authenticatedAs<U extends AnyTable, R extends AnyTable[] = []>(
	authTable: U,
	...related: R
) {
	type C = WorkableContext<Orm<[U, ...R]>>;
	return {
		where<
			Row extends AbstractType = LooseRow,
			Value extends AbstractType = AnyType,
		>(
			build: (
				row: RowActionable<C, Row>,
				ctx: PermissionContext<C, Actionable<C, RecordType<U["tb"]>>, Value>,
			) => Workable<C>,
		): WhereRule<Row, Value> {
			return new WhereRule<Row, Value>(
				build as unknown as RuleBuilder,
				authTable,
				related,
			);
		},
	};
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** A `$name` variable of the given type. */
function variable<T extends AbstractType>(
	ctx: WorkableContext,
	name: string,
	type: T,
): Actionable<WorkableContext, T> {
	return actionable({
		[__ctx]: ctx,
		[__type]: type,
		[__display]: () => `$${name}`,
	});
}

/** A variable that is `NONE` here: reading it is a mistake, not a condition. */
function unavailable(scope: Scope, name: string): never {
	throw new OrmError(
		`$${name} is not available in the permissions of a ${scope}: use it in a field's permissions`,
	);
}

const SESSION = t.object({
	ac: t.option(t.string()),
	db: t.option(t.string()),
	ns: t.option(t.string()),
	id: t.option(t.string()),
	ip: t.option(t.string()),
	or: t.option(t.string()),
	rd: t.option(t.record()),
	exp: t.option(t.any()),
});

/**
 * A value written into a rule, the way SurrealDB stores it, so that a definition
 * does not read back different.
 *
 * A record id is stored parenthesised (`(user:alice)`) where the SDK writes it
 * as `r"user:alice"`. A string is single-quoted, unless it holds a single quote,
 * when it is double-quoted instead.
 */
function literal(value: unknown): string {
	if (value instanceof RecordId) return `(${value.toString()})`;
	return typeof value === "string" ? stringLiteral(value) : inlineValue(value);
}

function stringLiteral(value: string): string {
	const quoted = JSON.stringify(value);
	if (value.includes("'")) return quoted;

	// Single-quoted, so a double quote needs no escape, and the other escapes
	// (`\\`, `\n`, `\t`) are the ones JSON writes.
	const body = quoted
		.slice(1, -1)
		.replace(/\\\\|\\"/g, (pair) => (pair === '\\"' ? '"' : pair));
	return `'${body}'`;
}

/** Run a typed rule and render the condition it builds. */
function renderWhere(
	rule: WhereRule,
	scope: Scope,
	env: RenderEnvironment,
): string {
	const tables: Record<
		string,
		{ readonly tb: string; readonly schema: AbstractType }
	> = { ...env.tables };
	for (const table of [rule.auth, ...rule.related]) {
		if (table) tables[table.tb] = table;
	}

	const id = Symbol();
	// Only the table map is read: a rule builds expressions, never queries.
	const ctx = { orm: { tables } as unknown as Orm, id } as WorkableContext;

	const row = actionable({
		[__ctx]: ctx,
		[__type]: tables[env.tb]?.schema ?? t.object({}),
		[__display]: () => "$this",
	});

	const field = (name: string) => {
		const value = variable(ctx, name, t.any());
		return scope === "field" ? value : unavailable(scope, name);
	};
	const variables: PermissionContext<WorkableContext, unknown> = {
		auth: variable(
			ctx,
			"auth",
			rule.auth ? new RecordType(rule.auth.tb) : t.object({}),
		),
		session: variable(ctx, "session", SESSION),
		token: variable(ctx, "token", t.object({})),
		access: variable(ctx, "access", t.option(t.string())),
		// Lazily, so a table's rule is only refused when it reads one.
		get value() {
			return field("value");
		},
		get before() {
			return field("before");
		},
		get after() {
			return field("after");
		},
	} as PermissionContext<WorkableContext, unknown>;

	const condition = (rule.build as (r: unknown, c: unknown) => Workable)(
		row,
		variables,
	);

	return simplifyCondition(
		condition[__display](
			displayContext({ var: literal, variables: {}, contextId: id }),
		),
	);
}

/**
 * A rule, introduced the way SurrealQL needs it.
 *
 * `FULL` and `NONE` stand alone; anything else is a condition and must follow
 * `WHERE`. Without it the statement is rejected with "expected 'NONE', 'FULL',
 * or 'WHERE'" — a mistake worth not leaving to the caller, since a rule reads as
 * a condition and so should be allowed to be written as one.
 */
function guard(rule: string): string {
	const trimmed = rule.trim();
	if (/^(FULL|NONE)$/i.test(trimmed)) return trimmed.toUpperCase();
	if (/^WHERE\b/i.test(trimmed)) return trimmed;

	return `WHERE ${trimmed}`;
}

/**
 * Render a `PERMISSIONS` clause, or an empty string when no rule is given.
 *
 * @param rules - One SurrealQL clause, or a rule per operation
 * @param scope - Whether the clause is a table's or a field's
 * @param env - The table, and the tables its record links resolve against
 */
export function renderPermissions(
	rules: string | Partial<Record<TableOperation, PermissionRule>>,
	scope: Scope,
	env: RenderEnvironment,
): string {
	if (typeof rules === "string") return `PERMISSIONS ${rules}`;

	const allowed: readonly string[] =
		scope === "field" ? FIELD_OPERATIONS : TABLE_OPERATIONS;
	const clauses: string[] = [];

	for (const [operation, rule] of Object.entries(rules)) {
		if (rule === undefined) continue;
		if (!allowed.includes(operation)) {
			throw new OrmError(
				`A ${scope} has no ${operation} permission: use ${allowed.join(", ")}`,
			);
		}
		const sql = isWhereRule(rule)
			? `WHERE ${renderWhere(rule, scope, env)}`
			: guard(rule);
		clauses.push(`FOR ${operation} ${sql}`);
	}

	return clauses.length ? `PERMISSIONS ${clauses.join(", ")}` : "";
}
