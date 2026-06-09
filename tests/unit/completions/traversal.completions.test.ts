import { beforeAll, describe, test } from "bun:test";
import { expectCompletions, warmCompletions } from "./harness";

const SCHEMA = `
import { ANY, edge, orm, t, table } from "./src";
import { RecordId, Surreal } from "surrealdb";

const user = table("user", { name: t.string(), age: t.number() });
const post = table("post", { title: t.string() });
const tag = table("tag", { label: t.string() });
const topic = table("topic", { name: t.string() });
const authored = edge("user", "authored", "post", { created: t.date() });
const tagged = edge("post", "tagged", "tag", {});
// A polymorphic edge: in ∈ {post, user}, out ∈ {tag, topic}.
const mentioned = edge(["post", "user"], "mentioned", ["tag", "topic"], {});

const db = orm(new Surreal(), user, post, tag, topic, authored, tagged, mentioned);
void [db, ANY, RecordId];
`;

beforeAll(() => warmCompletions(SCHEMA));

describe("graph traversal autocomplete", () => {
	test("out from a record suggests its outgoing edges", () => {
		expectCompletions(`db.value(new RecordId("user", "x")).out("|")`)
			.toSuggest("authored")
			.notToSuggest("tagged", "post", "user");
	});

	test("out from a different table suggests that table's edges", () => {
		expectCompletions(`db.value(new RecordId("post", "x")).out("|")`)
			.toSuggest("tagged")
			.notToSuggest("authored");
	});

	test("out after an edge step suggests the edge's target table", () => {
		expectCompletions(
			`db.value(new RecordId("user", "x")).out("authored").out("|")`,
		)
			.toSuggest("post")
			.notToSuggest("authored", "tagged");
	});

	test("multi-hop traversal narrows at each step", () => {
		expectCompletions(
			`db.value(new RecordId("user", "x")).out("authored").out("post").out("|")`,
		)
			.toSuggest("tagged")
			.notToSuggest("authored");
	});

	test("in suggests incoming edges", () => {
		expectCompletions(`db.value(new RecordId("post", "x")).in("|")`)
			.toSuggest("authored")
			.notToSuggest("tagged");
	});

	test("both suggests outgoing and incoming edges", () => {
		expectCompletions(
			`db.value(new RecordId("post", "x")).both("|")`,
		).toSuggest("authored", "tagged");
	});

	test("the injected segment factory suggests reachable edges", () => {
		// The factory `g` passed into the callback is bound to the current step,
		// so it suggests only the reachable out-edges — not every table, the way
		// the old ORM-bound `g.with(db)` helper did.
		expectCompletions(`db.value(new RecordId("user", "x")).out((g) => g("|"))`)
			.toSuggest("authored")
			.notToSuggest("tagged", "post", "user");
	});

	test("row-level traversal in a projection suggests edges", () => {
		expectCompletions(
			`db.select("user").return((u) => ({ p: u.id.out("|") }))`,
		).toSuggest("authored");
	});

	test("a multi-source edge is reachable from each of its source tables", () => {
		// `mentioned` has in ∈ {post, user}, so out() from either suggests it.
		expectCompletions(`db.value(new RecordId("post", "x")).out("|")`).toSuggest(
			"mentioned",
		);
		expectCompletions(`db.value(new RecordId("user", "x")).out("|")`).toSuggest(
			"mentioned",
		);
	});

	test("a multi-source edge is NOT reachable from a non-source table", () => {
		// `tag` is not in {post, user}, so it must not offer `mentioned` — this is
		// what proves `From` inferred as the union and was not widened to `string`
		// (a widened `From` would suggest the edge from every table).
		expectCompletions(
			`db.value(new RecordId("tag", "x")).out("|")`,
		).notToSuggest("mentioned", "authored", "tagged");
	});

	test("a multi-target edge lands on each of its target tables", () => {
		// out("mentioned") lands on the edge; stepping out suggests both targets.
		expectCompletions(
			`db.value(new RecordId("post", "x")).out("mentioned").out("|")`,
		).toSuggest("tag", "topic");
	});

	test("a multi-target edge is an incoming edge for each target table", () => {
		expectCompletions(`db.value(new RecordId("tag", "x")).in("|")`).toSuggest(
			"mentioned",
		);
		expectCompletions(`db.value(new RecordId("topic", "x")).in("|")`).toSuggest(
			"mentioned",
		);
	});
});
