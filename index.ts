import Surreal, { RecordId } from "surrealdb";
import { __display, __type, displayContext, edge, orm, t, table } from "./src";

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

const post = table("post", {
	title: t.string(),
	body: t.string(),
	author: t.record("user"),
	created: t.date(),
	updated: t.date(),
});

const db = orm(new Surreal(), user, post);

const ctx = displayContext();
const query = db.select("post").return((post) => ({
	title: post.title,
	author: db.select(post.author).return((user) => ({
		name: user.name.first,
		bla: user.id.eq(new RecordId("user", "123")),
	})),
}));

type a = t.infer<typeof query>;

console.log(query[__display](ctx));
console.log(ctx.variables);
