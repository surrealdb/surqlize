import { beforeAll, describe, test } from "bun:test";
import { expectCompletions, warmCompletions } from "./harness";

const SCHEMA = `
import { edge, orm, t, table } from "./src";
import { RecordId, Surreal } from "surrealdb";

const user = table("user", { name: t.string() });
const post = table("post", { title: t.string() });
const authored = edge("user", "authored", "post", {});

const db = orm(new Surreal(), user, post, authored);
void [db, RecordId];
`;

beforeAll(() => warmCompletions(SCHEMA));

describe("table-name autocomplete on query builders", () => {
	const tables = ["user", "post", "authored"];

	test("select suggests every table", () => {
		expectCompletions(`db.select("|")`).toSuggestExactly(...tables);
	});

	test("create suggests every table", () => {
		expectCompletions(`db.create("|")`).toSuggestExactly(...tables);
	});

	test("insert suggests every table", () => {
		expectCompletions(`db.insert("|")`).toSuggestExactly(...tables);
	});

	test("update suggests every table", () => {
		expectCompletions(`db.update("|")`).toSuggestExactly(...tables);
	});

	test("delete suggests every table", () => {
		expectCompletions(`db.delete("|")`).toSuggestExactly(...tables);
	});

	test("upsert suggests every table", () => {
		expectCompletions(`db.upsert("|")`).toSuggestExactly(...tables);
	});

	test("live suggests every table", () => {
		expectCompletions(`db.live("|")`).toSuggestExactly(...tables);
	});

	test("relate suggests the edge name", () => {
		expectCompletions(
			`db.relate("|", new RecordId("user", "a"), new RecordId("post", "b"))`,
		).toSuggest("authored");
	});
});
