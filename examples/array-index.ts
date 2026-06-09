import { Surreal } from "surrealdb";
import { __display, displayContext, edge, orm, t, table } from "../src";

const user = table("user", {
	name: t.object({
		first: t.string(),
		last: t.string(),
	}),
	age: t.number(),
	email: t.string(),
	created: t.date(),
	updated: t.date(),
	metadata: t.object({
		bio: t.string(),
		avatar: t.string(),
		eq: t.object({
			value: t.literal(true),
		}),
	}),
	props: t.array([t.string(), t.number(), t.bool()]),
	tags: t.array(t.string()),
	opt: t.option(t.string()),
});

const authored = edge("user", "authored", "post", {
	created: t.date(),
	updated: t.date(),
});

const post = table("post", {
	title: t.string(),
	body: t.string(),
	author: t.record("user"),
	created: t.date(),
	updated: t.date(),
});

const foo = table("foo", {});

const db = orm(new Surreal(), user, authored, post, foo);

const ctx = displayContext();

// Project a post, pulling its author's tags via a nested select and taking the
// first element with `.wrap()[0]` — the array-index pattern this example shows.
const bla = db
	.select("post")
	.return(({ title, author }) => ({
		title,
		tags: author
			.select()
			.return((x) => x.tags)
			.wrap()[0],
	}))
	.wrap()[0];

bla.eq({ title: "Hello, World!", tags: ["a"] });
bla.eq(undefined);

console.log(bla[__display](ctx));
console.log(ctx.variables);
