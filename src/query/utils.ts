import { escapeIdent } from "surrealdb";
import { joiningFilter } from "../functions/filters.ts";
import { type AbstractType, SurqlExpression } from "../types";
import {
	__ctx,
	type DisplayContext,
	type Workable,
	type WorkableContext,
} from "../utils";

/**
 * AND a condition onto the filter already on a query. Chained `.where()` calls
 * accumulate: each one narrows the rows the previous ones kept, so the filter is
 * `(first AND second)` rather than the last call replacing the first.
 */
export function andWhere<C extends WorkableContext>(
	filter: Workable<C> | undefined,
	condition: Workable<C>,
): Workable<C> {
	return filter
		? joiningFilter(condition[__ctx], "AND", filter, condition)
		: condition;
}

/**
 * Escape a dotted SurrealQL idiom path (e.g. `out.author`) segment by segment.
 *
 * Field identifiers are interpolated directly into the rendered query — unlike
 * values, which are bound as parameters — so each segment is passed through the
 * SDK's `escapeIdent`: bare identifiers are emitted unchanged, while names that
 * are not valid bare identifiers (spaces, punctuation, leading digits, …) are
 * safely quoted. The `.` separators that drive record-link traversal are
 * preserved between segments.
 */
export function escapeIdiomPath(path: string): string {
	return path.split(".").map(escapeIdent).join(".");
}

export type SetValue<T extends AbstractType> =
	| T["infer"]
	| { "+=": T["infer"] }
	| { "-=": T["infer"] };

/**
 * Process SET data by normalizing operator objects.
 * This function passes through operators like += and -= as-is,
 * while treating regular values normally.
 */
export function processSetOperators(
	data: Record<string, unknown>,
): Record<string, unknown> {
	const processedData: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data)) {
		// Operators are passed through as-is
		if (
			value &&
			typeof value === "object" &&
			("+=" in value || "-=" in value)
		) {
			processedData[key] = value;
		} else {
			processedData[key] = value;
		}
	}
	return processedData;
}

/**
 * Generate SET assignments for query display.
 * Handles regular assignments as well as += and -= operators.
 */
export function generateSetAssignments(
	data: Record<string, unknown>,
	ctx: DisplayContext,
): string[] {
	const assignments: string[] = [];
	for (const [key, value] of Object.entries(data)) {
		const field = escapeIdiomPath(key);
		if (value && typeof value === "object" && "+=" in value) {
			assignments.push(
				`${field} += ${ctx.var((value as { "+=": unknown })["+="])}`,
			);
		} else if (value && typeof value === "object" && "-=" in value) {
			assignments.push(
				`${field} -= ${ctx.var((value as { "-=": unknown })["-="])}`,
			);
		} else {
			assignments.push(`${field} = ${renderValue(value, ctx)}`);
		}
	}
	return assignments;
}

/** Render a value: raw SurrealQL expressions inline, everything else bound. */
export function renderValue(value: unknown, ctx: DisplayContext): string {
	return value instanceof SurqlExpression ? value.sql : ctx.var(value);
}
