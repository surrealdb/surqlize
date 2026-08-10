/**
 * A blog.
 *
 * Field validation, composite and unique indexes, full-text search, events that
 * fire on a state change, and two graph edges.
 *
 *   bun sur plan    --schema examples/blog.ts
 *   bun sur migrate --schema examples/blog.ts
 */
import { analyzer, edge, t, table } from "../src";

/** The analyzer the post search index refers to. */
export const english = analyzer("english", {
	tokenizers: ["blank", "class"],
	filters: ["lowercase", "ascii", "snowball(english)"],
});

/** Authors and commenters. */
export const user = table("user", {
	email: t.string().assert("$value != NONE").assert("string::is_email($value)"),
	name: t
		.string()
		.assert("$value != NONE")
		.assert("string::len($value) >= 2")
		.assert("string::len($value) <= 100"),
	bio: t.option(t.string()),
	isActive: t.bool().default(true),
	createdAt: t.date().valueExpr("time::now()"),
})
	.index("user_email", { fields: ["email"], unique: true })
	.index("user_active", { fields: ["isActive"] });

export const post = table("post", {
	author: t.record("user").assert("$value != NONE"),
	title: t
		.string()
		.assert("$value != NONE")
		.assert("string::len($value) >= 1")
		.assert("string::len($value) <= 200"),
	slug: t.string().assert("$value != NONE"),
	content: t.string().assert("$value != NONE"),
	excerpt: t.option(t.string()),
	tags: t.array(t.string()).default([]),
	published: t.bool().default(false),
	publishedAt: t.option(t.date()),
	viewCount: t.int().default(0),
	createdAt: t.date().valueExpr("time::now()"),
	updatedAt: t.date().valueExpr("time::now()"),
})
	.index("post_slug", { fields: ["slug"], unique: true })
	.index("post_author", { fields: ["author", "createdAt"] })
	.index("post_published", { fields: ["published", "publishedAt"] })
	.index("post_tags", { fields: ["tags"] })
	.index("post_recent", { fields: ["createdAt"] })
	// Full-text takes exactly one column.
	.index("post_search", {
		fields: ["content"],
		fulltext: { analyzer: "english" },
	})
	.event("set_published_at", {
		on: "UPDATE",
		when: "$before.published = false AND $after.published = true",
		body: "UPDATE $after.id SET publishedAt = time::now()",
	})
	.event("post_updated", {
		on: "UPDATE",
		body: "UPDATE $after.id SET updatedAt = time::now()",
	});

/** Threaded, via a self-link on `parent`. */
export const comment = table("comment", {
	post: t.record("post").assert("$value != NONE"),
	author: t.record("user").assert("$value != NONE"),
	parent: t.option(t.record("comment")),
	content: t
		.string()
		.assert("$value != NONE")
		.assert("string::len($value) >= 1")
		.assert("string::len($value) <= 5000"),
	createdAt: t.date().valueExpr("time::now()"),
	updatedAt: t.date().valueExpr("time::now()"),
})
	.index("comment_post", { fields: ["post", "createdAt"] })
	.index("comment_author", { fields: ["author", "createdAt"] })
	.index("comment_parent", { fields: ["parent"] });

/** One like per user per post, enforced by the index. */
export const liked = edge("user", "liked", "post", {
	likedAt: t.date().valueExpr("time::now()"),
}).index("liked_once", { fields: ["in", "out"], unique: true });

export const follows = edge("user", "follows", "user", {
	followedAt: t.date().valueExpr("time::now()"),
	notifications: t.bool().default(true),
});

export default [english, user, post, comment, liked, follows];
