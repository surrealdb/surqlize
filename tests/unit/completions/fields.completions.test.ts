import { beforeAll, describe, test } from "bun:test";
import { expectCompletions, warmCompletions } from "./harness";

const SCHEMA = `
import { orm, t, table } from "./src";
import { Surreal } from "surrealdb";

const user = table("user", {
	name: t.object({ first: t.string(), last: t.string() }),
	age: t.number(),
});
const post = table("post", { title: t.string() });

const db = orm(new Surreal(), user, post);
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
});
