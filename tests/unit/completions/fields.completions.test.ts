import { beforeAll, describe, test } from "bun:test";
import { expectCompletions, warmCompletions } from "./harness";

const SCHEMA = `
import { orm, t, table } from "./src";
import { Surreal } from "surrealdb";

const designer = table("designer", { displayName: t.string() });
const product = table("product", {
	designer: t.record("designer"),
	createdAt: t.date(),
});
const user = table("user", {
	name: t.object({ first: t.string(), last: t.string() }),
	age: t.number(),
	favourite: t.record("product"),
	carts: t.array(t.object({ total: t.number(), label: t.string() })),
	coupons: t.option(t.array(t.string())),
});
const post = table("post", { title: t.string() });

const db = orm(new Surreal(), designer, product, user, post);
void [db];
`;

beforeAll(() => warmCompletions(SCHEMA));

describe("field-name autocomplete", () => {
	test("a projection row exposes the table's fields", () => {
		expectCompletions(`db.select("user").return((row) => ({ x: row.| }))`)
			.toSuggest("name", "age")
			.notToSuggest("title");
	});

	test("a nested object field exposes its subfields", () => {
		expectCompletions(`db.select("user").return((row) => ({ x: row.name.| }))`)
			.toSuggest("first", "last")
			.notToSuggest("age");
	});

	test("a where callback row exposes the table's fields", () => {
		expectCompletions(`db.select("user").where((row) => row.|)`).toSuggest(
			"name",
			"age",
		);
	});

	test("groupBy suggests field names", () => {
		expectCompletions(`db.select("user").groupBy("|")`).toSuggest(
			"name",
			"age",
		);
	});

	test("orderBy suggests field names", () => {
		expectCompletions(`db.select("user").orderBy("|")`).toSuggest(
			"name",
			"age",
		);
	});

	test("insert fields() suggests field names", () => {
		expectCompletions(`db.insert("user").fields(["|"])`).toSuggest(
			"name",
			"age",
		);
	});

	test("update unset() suggests field names", () => {
		expectCompletions(`db.update("user").unset(["|"])`).toSuggest(
			"name",
			"age",
		);
	});

	// ─── #37 — record-link field access ──────────────────────────────────────

	test("a record-link field exposes the linked table's fields", () => {
		expectCompletions(`db.select("user").where((row) => row.favourite.|)`)
			.toSuggest("designer", "createdAt")
			.notToSuggest("name", "age");
	});

	test("chained record links expose the deeper table's fields", () => {
		expectCompletions(
			`db.select("user").where((row) => row.favourite.designer.|)`,
		).toSuggest("displayName");
	});

	// ─── #36 — array element access ──────────────────────────────────────────

	test("an array field offers element accessors", () => {
		expectCompletions(
			`db.select("user").where((row) => row.carts.|)`,
		).toSuggest("at", "len");
	});

	test("a bracket-indexed array element exposes its object fields", () => {
		expectCompletions(`db.select("user").where((row) => row.carts[0].|)`)
			.toSuggest("total", "label")
			.notToSuggest("name");
	});

	test("an .at(index) array element exposes its object fields", () => {
		expectCompletions(
			`db.select("user").where((row) => row.carts.at(0).|)`,
		).toSuggest("total", "label");
	});

	// ─── #39 — row.extend({ … }) ─────────────────────────────────────────────

	test("the projection row offers .extend", () => {
		expectCompletions(`db.select("user").return((row) => row.|)`).toSuggest(
			"extend",
		);
	});

	test("fields stay suggestable inside an extend({ … }) computed value", () => {
		expectCompletions(
			`db.select("user").return((row) => row.extend({ x: row.| }))`,
		).toSuggest("name", "age");
	});

	// ─── option<T> accessors ─────────────────────────────────────────────────

	test("an option field offers unwrap / unwrapOr / isNone / isSome", () => {
		expectCompletions(
			`db.select("user").where((row) => row.coupons.|)`,
		).toSuggest("unwrap", "unwrapOr", "isNone", "isSome");
	});

	test("unwrap() exposes the inner array's methods", () => {
		expectCompletions(
			`db.select("user").where((row) => row.coupons.unwrap().|)`,
		).toSuggest("at", "len");
	});
});
