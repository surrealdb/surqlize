import { escapeIdent } from "surrealdb";
import {
	type AbstractType,
	type DefaultValue,
	type HasDefault,
	ObjectType,
	SurqlExpression,
} from "../types";
import type { DisplayContext } from "../utils/display.ts";
import type { ModificationState } from "./modification-methods.ts";
import { renderValue } from "./utils.ts";

export type FieldDefault = [field: string, value: DefaultValue];

/** The `[field, default]` pairs declared on a table schema (excluding `id`). */
export function schemaDefaults(schema: AbstractType): FieldDefault[] {
	if (!(schema instanceof ObjectType)) return [];
	const defaults: FieldDefault[] = [];
	for (const [key, type] of Object.entries(
		schema.schema as Record<string, AbstractType & Partial<HasDefault>>,
	)) {
		if (key !== "id" && type._default !== undefined)
			defaults.push([key, type._default]);
	}
	return defaults;
}

/** Resolve a default: functions are called, static values and expressions pass through. */
function resolve(value: DefaultValue): unknown {
	return typeof value === "function" ? (value as () => unknown)() : value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/** Fill the absent (missing or `undefined`) default fields of a record. */
function fillRecord(
	record: Record<string, unknown>,
	defaults: FieldDefault[],
): Record<string, unknown> {
	const filled = { ...record };
	for (const [field, value] of defaults) {
		if (filled[field] === undefined) filled[field] = resolve(value);
	}
	return filled;
}

/** Fill defaults into data that is a record or an array of records; else untouched. */
export function fillData(data: unknown, defaults: FieldDefault[]): unknown {
	if (defaults.length === 0) return data;
	if (Array.isArray(data))
		return data.map((row) =>
			isPlainObject(row) ? fillRecord(row, defaults) : row,
		);
	return isPlainObject(data) ? fillRecord(data, defaults) : data;
}

const containsExpr = (value: unknown): boolean =>
	Array.isArray(value)
		? value.some(containsExpr)
		: isPlainObject(value) &&
			Object.values(value).some((v) => v instanceof SurqlExpression);

/**
 * Render record data. Bound as a single parameter unless a default expression
 * is present, in which case it is rendered as an object literal so the
 * expression can sit inline (every other value is still bound).
 */
export function renderData(data: unknown, ctx: DisplayContext): string {
	if (!containsExpr(data)) return ctx.var(data);
	if (Array.isArray(data))
		return `[${data.map((row) => renderData(row, ctx)).join(", ")}]`;
	const entries = Object.entries(data as Record<string, unknown>)
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => `${escapeIdent(k)}: ${renderValue(v, ctx)}`);
	return `{ ${entries.join(", ")} }`;
}

/**
 * Return the modification state a CREATE should render: the declared defaults
 * are added for every field the query does not set. SET / UNSET and no-data
 * creates gain assignments; CONTENT / MERGE gain missing keys. PATCH and
 * REPLACE are left alone.
 */
export function withDefaults(
	state: ModificationState,
	defaults: FieldDefault[],
): ModificationState {
	if (defaults.length === 0) return state;
	const next: ModificationState = { ...state };
	const mode = state._modificationMode;

	if (mode === undefined || mode === "set") {
		const set = { ...state._set };
		const covers = (key: string, field: string) =>
			key === field || key.startsWith(`${field}.`);
		for (const [field, value] of defaults) {
			const present =
				Object.keys(set).some((k) => covers(k, field)) ||
				(state._unset ?? []).some((u) => covers(u, field));
			if (!present) set[field] = resolve(value);
		}
		if (Object.keys(set).length > 0) next._set = set;
	} else if (mode === "content") {
		next._content = fillData(state._content, defaults);
	} else if (mode === "merge") {
		next._merge = fillData(state._merge, defaults);
	}
	return next;
}

/** Add defaulted fields to a `fields()` / `values()` insert; returns new fields and rows. */
export function fillValues(
	fields: string[],
	rows: unknown[][],
	defaults: FieldDefault[],
): { fields: string[]; rows: unknown[][] } {
	const missing = defaults.filter(([f]) => !fields.includes(f));
	// A defaulted column that is listed, but whose cell is `undefined`, takes its
	// default too, as an object row's `undefined` key does.
	const listed = defaults
		.filter(([f]) => fields.includes(f))
		.map(([f, v]) => [fields.indexOf(f), v] as const);
	return {
		fields: [...fields, ...missing.map(([f]) => f)],
		rows: rows.map((row) => {
			const filled = [...row];
			for (const [index, value] of listed) {
				if (filled[index] === undefined) filled[index] = resolve(value);
			}
			return [...filled, ...missing.map(([, v]) => resolve(v))];
		}),
	};
}
