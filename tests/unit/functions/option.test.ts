import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;
const assertType = <_T extends true>() => {};

describe("option.map()", () => {
	const user = table("user", {
		name: t.string(),
		bio: t.option(t.string()),
	});

	const db = orm(new Surreal(), user);

	test("guards the option with IS NONE instead of the invalid ? operator", () => {
		const query = db.select("user").return((u) => ({
			shout: u.bio.map((b) => b.uppercase()),
		}));
		const sql = query[__display](displayContext());

		expect(sql).toContain(
			"(IF $this.bio IS NONE THEN NONE ELSE string::uppercase($this.bio) END)",
		);
		expect(sql).not.toContain("?string::");
	});

	test("the result is an option of the callback's type", () => {
		const query = db.select("user").return((u) => ({
			shout: u.bio.map((b) => b.uppercase()),
		}));
		type Row = (typeof query)["type"][number];

		// `string | undefined`: the mapped value is absent when the input is.
		assertType<Equal<Row["shout"], string | undefined>>();
	});

	test("a callback returning an option does not produce option<option<T>>", () => {
		const query = db.select("user").return((u) => ({
			inner: u.bio.map(() => u.bio),
		}));
		type Row = (typeof query)["type"][number];
		assertType<Equal<Row["inner"], string | undefined>>();
	});
});
