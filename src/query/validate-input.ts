import type { Orm } from "../schema/orm.ts";
import { type AbstractType, ObjectType } from "../types";
import {
	checkRecord,
	checkSet,
	throwIfInvalid,
	type ValidationIssue,
} from "../validation.ts";
import type { ModificationState } from "./modification-methods.ts";

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

/** Validate the data of a write query's SET / CONTENT / MERGE / REPLACE clause. */
export function validateWrite(
	orm: Orm,
	tb: string,
	schema: AbstractType,
	state: ModificationState,
	kind: "create" | "update",
): void {
	if (!(schema instanceof ObjectType)) return;
	const computed = computedFieldsOf(orm, tb);
	const issues: ValidationIssue[] = [];

	if (state._content !== undefined) {
		issues.push(
			...checkRecord(schema, state._content, {
				mode: kind === "create" ? "create" : "update",
				implicit: implicitFieldsOf(orm, tb),
				computed,
			}),
		);
	}
	for (const data of [state._merge, state._replace]) {
		if (data !== undefined)
			issues.push(...checkRecord(schema, data, { mode: "update", computed }));
	}
	if (state._set !== undefined)
		issues.push(...checkSet(schema, state._set, computed));

	throwIfInvalid(issues, tb);
}
