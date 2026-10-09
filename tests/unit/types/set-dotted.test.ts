import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

/**
 * Compile-time checks for dotted keys in `.set()` (`{ "name.first": "Ada" }`).
 * `tsc` (run by `bun run type-check`) fails on a mismatch; the runtime checks
 * render the SurrealQL the same calls produce.
 */

const user = table("user", {
	name: t.object({ first: t.string(), last: t.string() }),
	age: t.number(),
	email: t.string(),
});

const db = orm(new Surreal(), user);

function render(query: unknown) {
	const ctx = displayContext();
	return (
		query as { [__display]: (ctx: ReturnType<typeof displayContext>) => string }
	)[__display](ctx);
}

describe("dotted keys in set()", () => {
	test("a dotted path into a nested object is accepted", () => {
		const q = db.update("user").set({ "name.first": "Ada" });
		expect(render(q)).toContain("name.first = ");
	});

	test("a dotted path can be combined with a plain field", () => {
		const q = db.update("user").set({ "name.first": "Ada", age: 36 });
		expect(render(q)).toContain("name.first = ");
		expect(render(q)).toContain("age = ");
	});

	test("the dotted path works on create() and relate-free inserts too", () => {
		const q = db.create("user").set({ "name.last": "Lovelace" });
		expect(render(q)).toContain("name.last = ");
	});

	test("an unknown dotted key is rejected", () => {
		db.update("user").set({
			// @ts-expect-error "name.middle" is not a field of name
			"name.middle": "x",
		});
	});

	test("a wrong value type for a dotted key is rejected", () => {
		db.update("user").set({
			// @ts-expect-error name.first is a string
			"name.first": 5,
		});
	});

	test("a dotted path into an optional nested object is accepted and checked", () => {
		const place = table("place", {
			address: t.option(t.object({ city: t.string() })),
		});
		const places = orm(new Surreal(), place);

		places.update("place").set({ "address.city": "Paris" });
		places.update("place").set({
			// @ts-expect-error address.city is a string
			"address.city": 5,
		});
		places.update("place").set({
			// @ts-expect-error address has no field "street"
			"address.street": "x",
		});
	});

	test("a dotted path into a non-object field is rejected", () => {
		db.update("user").set({
			// @ts-expect-error age is a number, not an object
			"age.x": 1,
		});
	});
});
