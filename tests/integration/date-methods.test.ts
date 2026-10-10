import { describe, expect, test } from "bun:test";
import { Duration } from "surrealdb";
import { orm, t, table } from "../../src";
import { withTestDb } from "./setup";

/**
 * Date methods checked against a live server: time::nano() overflows a JS
 * number, and time::ceil/floor/round take a duration, not a string.
 */
const event = table("event", {
	at: t.date(),
});

describe("date methods against a live server", () => {
	const getTestDb = withTestDb({
		setup: async ({ surreal }) => {
			await surreal.query(`
				CREATE event:a SET at = d"2024-01-01T10:30:00Z";
				CREATE event:b SET at = d"1970-01-01T00:00:01Z";
			`);
		},
	});

	// SurrealDB 3.0.5 rejects ORDER BY on a field the projection does not select,
	// so the rows are looked up by id instead of sorted.
	const rowFor = <R extends { id: { toString(): string } }>(
		rows: R[],
		id: "event:a" | "event:b",
	): R | undefined => rows.find((r) => r.id.toString() === id);

	describe("nano()", () => {
		test("returns the nanoseconds since the epoch as a bigint", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, event);

			const rows = await db
				.select("event")
				.return((e) => ({ id: e.id, n: e.at.nano() }))
				.execute();

			// 2024-01-01T10:30:00Z in milliseconds, times 1e6 for nanoseconds.
			const millis = BigInt(Date.parse("2024-01-01T10:30:00Z"));
			const row = rowFor(rows, "event:a");
			expect(typeof row?.n).toBe("bigint");
			expect(row?.n).toBe(millis * 1_000_000n);
		});

		test("a small value that the SDK returns as a number is still a bigint", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, event);

			const rows = await db
				.select("event")
				.return((e) => ({ id: e.id, n: e.at.nano() }))
				.execute();

			expect(rowFor(rows, "event:b")?.n).toBe(1_000_000_000n);
		});
	});

	describe("timeCeil() / timeFloor() / timeRound()", () => {
		test("take a Duration and round the date to a multiple of it", async () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, event);
			const hour = new Duration("1h");

			const rows = await db
				.select("event")
				.return((e) => ({
					id: e.id,
					ceil: e.at.timeCeil(hour),
					floor: e.at.timeFloor(hour),
					round: e.at.timeRound(hour),
				}))
				.execute();

			const row = rowFor(rows, "event:a");
			expect(row?.ceil.toISOString()).toBe("2024-01-01T11:00:00.000Z");
			expect(row?.floor.toISOString()).toBe("2024-01-01T10:00:00.000Z");
			expect(row?.round.toISOString()).toBe("2024-01-01T11:00:00.000Z");
		});

		test("a string is a type error, since the server needs a duration", () => {
			const { surreal } = getTestDb();
			const db = orm(surreal, event);

			db.select("event").return((e) => ({
				// @ts-expect-error a duration is a Duration, not a string
				ceil: e.at.timeCeil("1h"),
			}));
		});
	});
});
