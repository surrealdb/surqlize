import type { Orm } from "../schema/orm.ts";
import { type AbstractType, ObjectType, SurqlExpression } from "../types";
import { isWorkable } from "../utils/workable.ts";
import {
	checkRecord,
	checkRequired,
	checkSet,
	throwIfInvalid,
	type ValidationIssue,
} from "../validation.ts";
import type { ModificationState } from "./modification-methods.ts";

/**
 * The kind of write being checked:
 * - `create`: CREATE, and INSERT (which checks its rows on its own). CREATE
 *   fills the `.default()`s of the fields a SET, MERGE, CONTENT or empty write
 *   leaves out.
 * - `update`: UPDATE and UPSERT. Neither fills defaults. A SET or MERGE keeps
 *   the stored fields, so only a whole-record write is checked for required
 *   fields.
 * - `relate`: RELATE. It does not fill defaults.
 */
export type WriteKind = "create" | "update" | "relate";

/** The names of the read-only (computed) fields of `tb`, if it has any. */
export function computedFieldsOf(orm: Orm, tb: string): string[] {
	const schema = (orm.tables as Record<string, unknown>)[tb] as
		| { computedFields?: string[] }
		| undefined;
	return schema?.computedFields ?? [];
}

/** Fields the database supplies, so that create input may leave them out. */
export function implicitFieldsOf(orm: Orm, tb: string): string[] {
	const schema = (orm.tables as Record<string, unknown>)[tb];
	return "from" in (schema as object) ? ["id", "in", "out"] : ["id"];
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
	if (typeof value !== "object" || value === null) return false;
	if (value instanceof SurqlExpression || isWorkable(value)) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
};

/**
 * The top-level fields a new record is written with by a SET, MERGE or empty
 * write, or `undefined` when they cannot be read client-side (a MERGE of a
 * query or expression), in which case the required fields are not checked.
 */
function writtenFields(state: ModificationState): Set<string> | undefined {
	const written = new Set<string>();
	const mode = state._modificationMode;
	if (mode === "set" || mode === "merge") {
		const data = mode === "set" ? state._set : state._merge;
		if (data === undefined) return written;
		if (!isPlainRecord(data)) return undefined;
		for (const [key, value] of Object.entries(data)) {
			if (value !== undefined) written.add(key.split(".")[0] as string);
		}
	}
	for (const key of state._unset ?? []) {
		written.delete(key.split(".")[0] as string);
	}
	return written;
}

/**
 * Validate the data of a write query's SET / CONTENT / MERGE / REPLACE clause,
 * and that a new record is given every required field. A required field is one
 * the write cannot leave out (see {@link WriteKind}). A PATCH is not checked.
 */
export function validateWrite(
	orm: Orm,
	tb: string,
	schema: AbstractType,
	state: ModificationState,
	kind: WriteKind,
): void {
	if (!(schema instanceof ObjectType)) return;
	const computed = computedFieldsOf(orm, tb);
	const implicit = implicitFieldsOf(orm, tb);
	const fills = kind === "create";
	const issues: ValidationIssue[] = [];

	if (state._content !== undefined) {
		issues.push(
			...checkRecord(schema, state._content, {
				mode: "create",
				implicit,
				computed,
				fills,
			}),
		);
	}
	// REPLACE stores the record as given, without filling defaults.
	if (state._replace !== undefined) {
		issues.push(
			...checkRecord(schema, state._replace, {
				mode: "create",
				implicit,
				computed,
				fills: false,
			}),
		);
	}
	if (state._merge !== undefined)
		issues.push(
			...checkRecord(schema, state._merge, { mode: "update", computed }),
		);
	if (state._set !== undefined)
		issues.push(...checkSet(schema, state._set, computed));

	const wholeRecord =
		state._content !== undefined || state._replace !== undefined;
	const newRecord = kind !== "update";
	if (newRecord && !wholeRecord && state._modificationMode !== "patch") {
		const written = writtenFields(state);
		if (written !== undefined)
			issues.push(
				...checkRequired(schema, written, { implicit, computed, fills }),
			);
	}
	throwIfInvalid(issues, tb);
}
