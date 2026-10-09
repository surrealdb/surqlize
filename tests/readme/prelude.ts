/**
 * The running example that README snippets use without declaring: `surreal`
 * (a connection), `db` (an ORM over the tables below) and the table and edge
 * names. The README harness imports these names into every snippet. A snippet
 * that declares its own table or `db` shadows them, as a reader would expect.
 *
 * It is a superset of the schemas the README's examples describe, so a field
 * can be used without a snippet declaring it. A snippet that needs a field
 * with a different type from the one here declares its own table.
 */
import { Surreal } from "surrealdb";
import { edge, orm, t, table } from "../../src";

export const surreal = new Surreal();

export const user = table("user", {
	name: t.string(),
	email: t.string(),
	age: t.number(),
	created: t.date(),
	updated: t.date(),
	isActive: t.bool(),
	archived: t.bool(),
	bio: t.option(t.string()),
	tags: t.array(t.string()),
	oldTags: t.array(t.string()),
	status: t.string(),
	role: t.string(),
	lastSeen: t.date(),
	lastLogin: t.date(),
	firstName: t.string(),
	lastName: t.string(),
	score: t.number(),
});

export const post = table("post", {
	title: t.string(),
	body: t.string(),
	content: t.string(),
	author: t.record("user"),
	authorId: t.record("user"),
	tags: t.array(t.string()),
	oldTags: t.array(t.string()),
	categories: t.array(t.string()),
	published: t.bool(),
	views: t.number(),
	created: t.date(),
	updated: t.date(),
});

export const tag = table("tag", { label: t.string() });

export const author = table("author", { name: t.string() });

export const product = table("product", {
	title: t.string(),
	author: t.record("author"),
});

export const person = table("person", { name: t.string() });

export const pageview = table("pageview", {
	count: t.number(),
	lastViewed: t.date(),
});

export const counter = table("counter", { n: t.number() });

export const account = table("account", { balance: t.number() });

export const report = table("report", { status: t.string() });

export const authored = edge("user", "authored", "post", {
	created: t.date(),
	role: t.union([t.literal("author"), t.literal("co-author")]),
});

export const tagged = edge("post", "tagged", "tag", {});

export const likes = edge("user", "likes", "post", {
	created: t.date(),
	rating: t.number(),
});

export const follows = edge("user", "follows", "user", {
	since: t.date(),
});

export const knows = edge("person", "knows", "person", {
	since: t.number(),
});

export const purchased = edge("user", "purchased", "product", {});

export const db = orm(
	surreal,
	user,
	post,
	tag,
	author,
	product,
	person,
	pageview,
	counter,
	account,
	report,
	authored,
	tagged,
	likes,
	follows,
	knows,
	purchased,
);
