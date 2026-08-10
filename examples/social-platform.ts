/**
 * A discussion platform.
 *
 * Every table is schemaless, so the declared fields are validated and anything
 * else is still allowed through — useful while a shape is still settling.
 *
 *   bun sur plan    --schema examples/social-platform.ts
 *   bun sur migrate --schema examples/social-platform.ts
 */
import { t, table } from "../src";

export const user = table("user", {
	email: t.string().assert("string::is_email($value)"),
	name: t
		.string()
		.assert("$value != NONE")
		.assert("string::len($value) >= 3")
		.assert("string::len($value) <= 32"),
	link: t.option(t.string()),
	description: t.option(t.string()),
	dateJoined: t.date().default("time::now()"),
	tokens: t.int().default(0).assert("$value >= 0"),
	roles: t.array(t.string()).default([]),
})
	.schemaless()
	.index("user_email", { fields: ["email"], unique: true })
	.index("user_name", { fields: ["name"], unique: true });

export const topic = table("topic", {
	posts: t.array(t.record("post")).default([]),
	threads: t.array(t.record("thread")).default([]),
}).schemaless();

export const post = table("post", {
	user: t.record("user"),
	title: t.string().assert("$value != NONE"),
	content: t.string(),
	time: t.date().default("time::now()"),
	replyTo: t.option(t.record("post")),
	topics: t.array(t.record("topic")).default([]),
	archived: t.bool().default(false),
	edited: t.bool().default(false),
	visits: t.int().default(0),
}).schemaless();

export const thread = table("thread", {
	user: t.record("user"),
	content: t.string().assert("$value != NONE"),
	time: t.date().default("time::now()"),
	replyTo: t.option(t.record("thread")),
	topics: t.array(t.record("topic")).default([]),
	edited: t.bool().default(false),
	visits: t.int().default(0),
}).schemaless();

export const comment = table("comment", {
	user: t.record("user"),
	post: t.record("post"),
	content: t.string(),
	time: t.date().default("time::now()"),
	edited: t.bool().default(false),
}).schemaless();

export const notification = table("notification", {
	recipient: t.record("user"),
	message: t.string(),
	time: t.date().default("time::now()"),
	viewed: t.bool().default(false),
}).schemaless();

export default [user, topic, post, thread, comment, notification];
