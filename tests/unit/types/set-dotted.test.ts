import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import { __display, displayContext, edge, orm, t, table } from "../../../src";
import { OrmError } from "../../../src/error";

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

const person = table("person", { name: t.string() });

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

	test("create() accepts a dotted key when its parent object is set in the same call", () => {
		const q = db
			.create("user")
			.set({ name: { first: "Ada", last: "Lovelace" }, "name.last": "Byron" });
		expect(render(q)).toContain("name.last = ");
	});

	test("create() rejects a dotted key whose parent object is not set in the same call", () => {
		expect(() =>
			db.create("user").set({
				// @ts-expect-error name is not set in this call, so name.last would store a partial object
				"name.last": "Lovelace",
			}),
		).toThrow(OrmError);
	});

	test("relate() rejects a dotted key whose parent object is not set in the same call", () => {
		const meta = edge("person", "knows", "person", {
			detail: t.object({ note: t.string() }),
		});
		const people = orm(new Surreal(), person, meta);
		expect(() =>
			people
				.relate(
					"knows",
					new RecordId("person", "a"),
					new RecordId("person", "b"),
				)
				.set({
					// @ts-expect-error detail is not set in this call, so detail.note would store a partial object
					"detail.note": "x",
				}),
		).toThrow(OrmError);
	});

	test("relate() accepts a dotted key when its parent object is set in the same call", () => {
		const meta = edge("person", "knows", "person", {
			detail: t.object({ note: t.string() }),
		});
		const people = orm(new Surreal(), person, meta);
		const q = people
			.relate("knows", new RecordId("person", "a"), new RecordId("person", "b"))
			.set({ detail: { note: "a" }, "detail.note": "b" });
		expect(render(q)).toContain("detail.note = ");
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
