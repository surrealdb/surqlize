import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

describe("Date functions", () => {
	const user = table("user", {
		created: t.date(),
	});

	const db = orm(new Surreal(), user);

	test("day() generates time::day", () => {
		const query = db.select("user").return((user) => ({
			dayVal: user.created.day(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::day");
	});

	test("hour() generates time::hour", () => {
		const query = db.select("user").return((user) => ({
			hourVal: user.created.hour(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::hour");
	});

	test("minute() generates time::minute", () => {
		const query = db.select("user").return((user) => ({
			minuteVal: user.created.minute(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::minute");
	});

	test("second() generates time::second", () => {
		const query = db.select("user").return((user) => ({
			secondVal: user.created.second(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::second");
	});

	test("month() generates time::month", () => {
		const query = db.select("user").return((user) => ({
			monthVal: user.created.month(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::month");
	});

	test("year() generates time::year", () => {
		const query = db.select("user").return((user) => ({
			yearVal: user.created.year(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::year");
	});

	test("week() generates time::week", () => {
		const query = db.select("user").return((user) => ({
			weekVal: user.created.week(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::week");
	});

	test("wday() generates time::wday", () => {
		const query = db.select("user").return((user) => ({
			wdayVal: user.created.wday(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::wday");
	});

	test("yday() generates time::yday", () => {
		const query = db.select("user").return((user) => ({
			ydayVal: user.created.yday(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::yday");
	});

	test("unix() generates time::unix", () => {
		const query = db.select("user").return((user) => ({
			unixVal: user.created.unix(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::unix");
	});

	test("millis() generates time::millis", () => {
		const query = db.select("user").return((user) => ({
			millisVal: user.created.millis(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::millis");
	});

	test("micros() generates time::micros", () => {
		const query = db.select("user").return((user) => ({
			microsVal: user.created.micros(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::micros");
	});

	test("nano() generates time::nano", () => {
		const query = db.select("user").return((user) => ({
			nanoVal: user.created.nano(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::nano");
	});

	test("format('%Y-%m-%d') generates time::format", () => {
		const query = db.select("user").return((user) => ({
			formatted: user.created.format("%Y-%m-%d"),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::format");
	});

	test("isLeapYear() generates time::is_leap_year", () => {
		const query = db.select("user").return((user) => ({
			leap: user.created.isLeapYear(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("time::is_leap_year");
	});
});
