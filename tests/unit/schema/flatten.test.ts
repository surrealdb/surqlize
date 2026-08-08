import { describe, expect, test } from "bun:test";
import { t } from "../../../src";
import { flattenFields } from "../../../src/schema/ddl/flatten";

/** The dotted paths a field map expands to, in order. */
function paths(fields: Record<string, never>): string[] {
	return flattenFields(fields).map((f) => f.name);
}

describe("flattenFields", () => {
	test("leaves flat fields alone", () => {
		expect(paths({ name: t.string(), age: t.int() } as never)).toEqual([
			"name",
			"age",
		]);
	});

	test("emits the parent object before its children", () => {
		// The parent must exist or its children have nothing to attach to.
		expect(
			paths({
				address: t.object({ street: t.string(), city: t.string() }),
			} as never),
		).toEqual(["address", "address.street", "address.city"]);
	});

	test("recurses to any depth", () => {
		expect(
			paths({ a: t.object({ b: t.object({ c: t.string() }) }) } as never),
		).toEqual(["a", "a.b", "a.b.c"]);
	});

	test("looks through option to find nested structure", () => {
		expect(
			paths({ profile: t.option(t.object({ bio: t.string() })) } as never),
		).toEqual(["profile", "profile.bio"]);
	});

	test("reaches into arrays through the element wildcard", () => {
		expect(
			paths({ items: t.array(t.object({ sku: t.string() })) } as never),
		).toEqual(["items", "items[*].sku"]);
	});

	test("does not emit the array element field itself", () => {
		// SurrealDB creates `items[*]` for every array; defining it by hand shows
		// up as an extra field on the next diff.
		expect(paths({ tags: t.array(t.string()) } as never)).toEqual(["tags"]);
	});

	test("handles a set of objects like an array", () => {
		expect(
			paths({ tags: t.set(t.object({ name: t.string() })) } as never),
		).toEqual(["tags", "tags[*].name"]);
	});

	test("looks through option wrapping an array of objects", () => {
		expect(
			paths({
				items: t.option(t.array(t.object({ sku: t.string() }))),
			} as never),
		).toEqual(["items", "items[*].sku"]);
	});

	test("treats a tuple as opaque — it has no single element type", () => {
		expect(paths({ pair: t.array([t.string(), t.int()]) } as never)).toEqual([
			"pair",
		]);
	});

	test("carries each field's own DDL metadata", () => {
		const flat = flattenFields({
			address: t.object({ street: t.string().assert("x") }),
		} as never);

		expect(flat.find((f) => f.name === "address.street")?.ddl.assert).toEqual([
			"x",
		]);
	});
});
