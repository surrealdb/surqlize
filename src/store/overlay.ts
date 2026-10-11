import { RecordId } from "surrealdb";
import type { OutboxOp } from "./outbox";

/**
 * Show `ops`, the writes that are waiting to be sent, on top of `rows`.
 *
 * - A create adds a row, if `insert` allows it: always, never, or when the new
 *   row passes the check it is given.
 * - An update changes the row if it is there, and removes it if the changed row
 *   no longer `stays`. A record that is not in the result is not added, as it
 *   may not belong to it.
 * - A delete removes the row.
 *
 * Rows keep their order, and created rows go at the end. The result is a new
 * array; rows that no write touches are the same objects.
 */
export function applyOverlay<T>(
	rows: T[],
	ops: readonly OutboxOp[],
	keyOf: (row: T) => string,
	insert: boolean | ((row: T) => boolean),
	stays: (row: T) => boolean = () => true,
): T[] {
	if (ops.length === 0) return rows;
	const map = new Map<string, T>();
	for (const row of rows) map.set(keyOf(row), row);
	for (const op of ops) applyOp(map, op, insert, stays);
	return [...map.values()];
}

function applyOp<T>(
	map: Map<string, T>,
	op: OutboxOp,
	insert: boolean | ((row: T) => boolean),
	stays: (row: T) => boolean,
): void {
	const id = new RecordId(op.table, op.id as never);
	const key = String(id);
	if (op.kind === "delete") {
		map.delete(key);
	} else if (op.kind === "create") {
		const row = { id, ...op.data } as T;
		if (typeof insert === "function" ? insert(row) : insert) map.set(key, row);
	} else {
		const existing = map.get(key);
		if (existing === undefined) return;
		const changed = patch(existing, op.data ?? {});
		if (stays(changed)) map.set(key, changed);
		else map.delete(key);
	}
}

/** A copy of `row` with `data` merged over it, keeping what kind of object it is. */
function patch<T>(row: T, data: Record<string, unknown>): T {
	return Object.assign(
		Object.create(Object.getPrototypeOf(row)),
		row,
		data,
	) as T;
}
