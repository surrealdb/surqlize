import { ValidationError, type ValidationIssue } from "./error";
import {
	type AbstractType,
	ArrayType,
	type HasDefault,
	ObjectType,
	OptionType,
	SurqlExpression,
	UnionType,
} from "./types";
import { isWorkable } from "./utils/workable";

export type { ValidationIssue };

/**
 * What a piece of data is validated as.
 *
 * - `create`: the input of a create / insert / relate. Every field must be
 *   present unless it is `option<…>` or has a `.default()`.
 * - `update`: a partial write (update / upsert / merge / set). Only the fields
 *   present are checked.
 * - `row`: a whole record as stored, including `id` and computed fields.
 */
export type ValidationMode = "create" | "update" | "row";

/** The result of `safeParse()`: the data, or why it was rejected. */
export type SafeParseResult<T> =
	| { success: true; data: T }
	| { success: false; error: ValidationError };

export type CheckOptions = {
	mode: ValidationMode;
	/** Fields that need not be supplied on create (the ones the database fills in). */
	implicit?: readonly string[];
	/** Read-only fields: supplying a value for one is an issue. */
	computed?: readonly string[];
	/**
	 * Whether the write fills the `.default()` of a field it leaves out. CREATE
	 * does (for SET, MERGE, CONTENT and an empty create); REPLACE, RELATE and
	 * UPDATE do not. Defaults the write does not fill are required. Defaults to
	 * `true`, which is what a plain CREATE or INSERT does.
	 */
	fills?: boolean;
};

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function join(path: string, key: string | number): string {
	if (typeof key === "number") return `${path}[${key}]`;
	if (!IDENT.test(key)) return `${path}[${JSON.stringify(key)}]`;
	return path === "" ? key : `${path}.${key}`;
}

function describe(value: unknown): string {
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (typeof value === "string")
		return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
	if (typeof value !== "object") return String(value);
	if (Array.isArray(value)) return `array of ${value.length}`;
	const name = (value as object).constructor?.name;
	return name && name !== "Object" ? name : "object";
}

function expectedOf(type: AbstractType): string {
	if (type instanceof ObjectType) return "object";
	if (type instanceof ArrayType) {
		const schema = type.schema as AbstractType | AbstractType[];
		return Array.isArray(schema)
			? `tuple of ${schema.length}`
			: `array of ${expectedOf(schema)}`;
	}
	if (type instanceof OptionType)
		return `${expectedOf(type.schema)} or undefined`;
	if (type instanceof UnionType)
		return (type.schema as AbstractType[]).map(expectedOf).join(" or ");
	const { expected } = type;
	return Array.isArray(expected) ? expected.join(" or ") : expected;
}

function report(
	issues: ValidationIssue[],
	path: string,
	expected: string,
	received: unknown,
): void {
	const where = path === "" ? "(root)" : path;
	issues.push({
		path: where,
		expected,
		received,
		message: `${where}: expected ${expected}, received ${describe(received)}`,
	});
}

const READ_ONLY = "undefined (computed fields are read-only)";

/** Values the database evaluates itself: they cannot be checked client-side. */
const isDeferred = (value: unknown): boolean =>
	value instanceof SurqlExpression || isWorkable(value);

const hasDefault = (type: AbstractType): boolean =>
	(type as Partial<HasDefault>)._default !== undefined;

/** Whether a missing `key` is fine, given what is being validated. */
function mayBeMissing(
	field: AbstractType,
	key: string,
	options?: CheckOptions,
): boolean {
	if (options?.mode === "update") return true;
	if (options?.mode === "create" && options.implicit?.includes(key))
		return true;
	return hasDefault(field) && (options?.fills ?? true);
}

function collectObject(
	type: ObjectType,
	value: unknown,
	path: string,
	issues: ValidationIssue[],
	options?: CheckOptions,
): void {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		report(issues, path, "object", value);
		return;
	}
	const record = value as Record<string, unknown>;
	const schema = type.schema as Record<string, AbstractType>;
	for (const key in schema) {
		const field = schema[key] as AbstractType;
		const given = record[key];
		if (options?.computed?.includes(key)) {
			if (given !== undefined)
				report(issues, join(path, key), READ_ONLY, given);
		} else if (given !== undefined || !mayBeMissing(field, key, options)) {
			collect(field, given, join(path, key), issues);
		}
	}
}

function collectArray(
	type: ArrayType,
	value: unknown,
	path: string,
	issues: ValidationIssue[],
): void {
	const schema = type.schema as AbstractType | AbstractType[];
	if (!Array.isArray(value)) {
		report(issues, path, expectedOf(type), value);
	} else if (!Array.isArray(schema)) {
		value.forEach((item, i) => {
			collect(schema, item, join(path, i), issues);
		});
	} else if (schema.length !== value.length) {
		report(issues, path, expectedOf(type), value);
	} else {
		schema.forEach((member, i) => {
			collect(member, value[i], join(path, i), issues);
		});
	}
}

/** Check `value` against `type`, recording every failure rather than stopping at the first. */
function collect(
	type: AbstractType,
	value: unknown,
	path: string,
	issues: ValidationIssue[],
	options?: CheckOptions,
): void {
	if (isDeferred(value)) return;
	if (type instanceof OptionType) {
		if (value !== undefined) collect(type.schema, value, path, issues);
	} else if (type instanceof ObjectType) {
		collectObject(type, value, path, issues, options);
	} else if (type instanceof ArrayType) {
		collectArray(type, value, path, issues);
	} else if (!type.validate(value)) {
		report(issues, path, expectedOf(type), value);
	}
}

/**
 * Validate a record (or, in `update` mode, part of one) against an object
 * schema, returning every issue found. Fields the schema does not declare are
 * left alone. `prefix` is prepended to each issue's path, for rows of a batch.
 */
export function checkRecord(
	schema: ObjectType,
	data: unknown,
	options: CheckOptions,
	prefix = "",
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	collect(schema, data, prefix, issues, options);
	return issues;
}

/** The type a (possibly dotted) field path resolves to, if the schema knows it. */
function resolve(schema: ObjectType, path: string): AbstractType | undefined {
	let type: AbstractType = schema;
	for (const segment of path.split(".")) {
		while (type instanceof OptionType) type = type.schema;
		if (!(type instanceof ObjectType)) return undefined;
		const next = (type.schema as Record<string, AbstractType>)[segment];
		if (next === undefined) return undefined;
		type = next;
	}
	return type;
}

const isOperator = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" &&
	value !== null &&
	("+=" in value || "-=" in value);

/** Check the operand of a `+=` / `-=`: only number and array fields are checked. */
function collectOperand(
	type: AbstractType,
	operand: unknown,
	path: string,
	issues: ValidationIssue[],
): void {
	if (isDeferred(operand)) return;
	let base = type;
	while (base instanceof OptionType) base = base.schema;
	if (base instanceof ArrayType && !Array.isArray(base.schema)) {
		// `tags += "x"` appends an element; `tags += ["x"]` appends an array.
		const member = base.schema as AbstractType;
		collect(Array.isArray(operand) ? base : member, operand, path, issues);
	} else if (base.name === "number") {
		collect(base, operand, path, issues);
	}
}

/**
 * Validate the assignments of a `SET` / `ON DUPLICATE KEY UPDATE` clause.
 * `+=` / `-=` operands are checked for number and array fields; other operands
 * (such as a duration added to a date) are left to the database.
 */
export function checkSet(
	schema: ObjectType,
	data: Record<string, unknown>,
	computed: readonly string[] = [],
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	for (const [key, raw] of Object.entries(data)) {
		const type = resolve(schema, key);
		if (computed.includes(key.split(".")[0] as string)) {
			if (raw !== undefined) report(issues, key, READ_ONLY, raw);
		} else if (!type || isDeferred(raw)) {
			// Unknown to the schema, or evaluated by the database.
		} else if (isOperator(raw)) {
			collectOperand(type, raw["+="] ?? raw["-="], key, issues);
		} else if (raw !== undefined || !hasDefault(type)) {
			collect(type, raw, key, issues);
		}
	}
	return issues;
}

/**
 * The required fields a new record is missing. `written` is the set of
 * top-level fields the write sets. A field is not required if it accepts
 * `undefined`, is implicit or computed, or has a `.default()` that the write
 * fills (see {@link CheckOptions.fills}).
 */
export function checkRequired(
	schema: ObjectType,
	written: ReadonlySet<string>,
	options: {
		implicit?: readonly string[];
		computed?: readonly string[];
		fills: boolean;
	},
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const fields = schema.schema as Record<string, AbstractType>;
	for (const key in fields) {
		const field = fields[key] as AbstractType;
		if (
			written.has(key) ||
			options.implicit?.includes(key) ||
			options.computed?.includes(key) ||
			(options.fills && hasDefault(field)) ||
			field.validate(undefined)
		)
			continue;
		issues.push({
			path: key,
			expected: expectedOf(field),
			received: undefined,
			message: `${key}: required field is not set`,
		});
	}
	return issues;
}

/** Throw a {@link ValidationError} if `issues` is not empty. */
export function throwIfInvalid(
	issues: readonly ValidationIssue[],
	table?: string,
): void {
	if (issues.length > 0) throw new ValidationError(issues, table);
}

/**
 * Validate `data` against `schema` and return it typed, or the error listing
 * every issue. The data is returned as given: validation does not convert it.
 */
export function safeParseWith<T>(
	schema: ObjectType,
	data: unknown,
	mode: ValidationMode,
	table: string,
	implicit: readonly string[],
	computed: readonly string[],
): SafeParseResult<T> {
	const issues = checkRecord(schema, data, {
		mode,
		implicit,
		computed: mode === "row" ? [] : computed,
	});
	return issues.length === 0
		? { success: true, data: data as T }
		: { success: false, error: new ValidationError(issues, table) };
}
