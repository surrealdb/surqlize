import { RecordId } from "surrealdb";
import { copyModelContext } from "../schema/model";
import type { OutboxOp } from "./outbox";

/** Model construction hooks used by Store.query for optimistic rows. */
export type OverlayMaterializer<T> = {
	create(row: Record<string, unknown>, op: OutboxOp): T;
	update?(row: T, data: Record<string, unknown>, op: OutboxOp): T | undefined;
};

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
	return applyOverlayWithMaterializer(rows, ops, keyOf, insert, stays);
}

/** Internal variant for Store.query's model-aware optimistic rows. */
export function applyOverlayWithMaterializer<T>(
	rows: T[],
	ops: readonly OutboxOp[],
	keyOf: (row: T) => string,
	insert: boolean | ((row: T) => boolean),
	stays: (row: T) => boolean = () => true,
	materializer?: OverlayMaterializer<T>,
): T[] {
	if (ops.length === 0) return rows;
	const map = new Map<string, T>();
	for (const row of rows) map.set(keyOf(row), row);
	for (const op of ops) applyOp(map, op, insert, stays, materializer);
	return [...map.values()];
}

function applyOp<T>(
	map: Map<string, T>,
	op: OutboxOp,
	insert: boolean | ((row: T) => boolean),
	stays: (row: T) => boolean,
	materializer?: OverlayMaterializer<T>,
): void {
	const id = new RecordId(op.table, op.id as never);
	const key = String(id);
	if (op.kind === "delete") {
		map.delete(key);
	} else if (op.kind === "create") {
		if (insert === false) return;
		const data = { ...op.data, id };
		if (materializer) {
			if (typeof insert === "function" && !insert(data as T)) return;
			map.set(key, materializer.create(data, op));
			return;
		}
		const row = data as T;
		if (typeof insert === "function" ? insert(row) : insert) map.set(key, row);
	} else {
		const existing = map.get(key);
		if (existing === undefined) return;
		const data = op.data ?? {};
		const changed =
			materializer?.update?.(existing, data, op) ?? patch(existing, data);
		if (stays(changed)) map.set(key, changed);
		else map.delete(key);
	}
}

/** A copy of `row` with `data` merged over it, keeping what kind of object it is. */
function patch<T>(row: T, data: Record<string, unknown>): T {
	const hasId = typeof row === "object" && row !== null && "id" in row;
	const copy = Object.assign(
		Object.create(Object.getPrototypeOf(row)),
		row,
		data,
		hasId ? { id: (row as { id?: unknown }).id } : {},
	) as T;
	if (
		typeof row === "object" &&
		row !== null &&
		typeof copy === "object" &&
		copy !== null
	) {
		copyModelContext(row, copy);
	}
	return copy;
}
