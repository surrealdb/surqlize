import { RecordId } from "surrealdb";
import type { OutboxOp } from "./outbox";

/**
 * Show `ops`, the writes that are waiting to be sent, on top of `rows`.
 *
 * - A create adds a row, if `insert` allows it.
 * - An update changes the row if it is there; a record that is not in the
 *   result is not added, as it may not belong to it.
 * - A delete removes the row.
 *
 * Rows keep their order, and created rows go at the end. The result is a new
 * array; rows that no write touches are the same objects.
 */
export function applyOverlay<T>(
	rows: T[],
	ops: readonly OutboxOp[],
	keyOf: (row: T) => string,
	insert: boolean,
): T[] {
	if (ops.length === 0) return rows;
	const map = new Map<string, T>();
	for (const row of rows) map.set(keyOf(row), row);

	for (const op of ops) {
		const id = new RecordId(op.table, op.id as never);
		const key = String(id);
		if (op.kind === "delete") {
			map.delete(key);
		} else if (op.kind === "create") {
			if (insert) map.set(key, { id, ...op.data } as T);
		} else {
			const existing = map.get(key);
			if (existing !== undefined) map.set(key, patch(existing, op.data ?? {}));
		}
	}
	return [...map.values()];
}

/** A copy of `row` with `data` merged over it, keeping what kind of object it is. */
function patch<T>(row: T, data: Record<string, unknown>): T {
	return Object.assign(
		Object.create(Object.getPrototypeOf(row)),
		row,
		data,
	) as T;
}
