/**
 * A social network.
 *
 * Composite indexes, denormalised counters, and two edges between the same pair
 * of tables.
 *
 *   bun sur plan    --schema examples/social-network.ts
 *   bun sur migrate --schema examples/social-network.ts
 */
import { edge, t, table } from "surqlize";

export const user = table("user", {
	uuid: t.uuid().default("rand::uuid::v7()"),
	username: t
		.string()
		.assert("$value != NONE")
		.assert("string::len($value) >= 3")
		.assert("string::len($value) <= 20"),
	email: t.string().assert("string::is_email($value)"),
	firstName: t.string().assert("$value != NONE"),
	lastName: t.string().assert("$value != NONE"),
	bio: t.option(t.string()),
	avatarUrl: t.option(t.string()),
	isVerified: t.bool().default(false),
	// Kept up to date by the application rather than by the schema.
	followerCount: t.int().default(0),
	followingCount: t.int().default(0),
	postCount: t.int().default(0),
	createdAt: t.date().valueExpr("time::now()"),
})
	.index("user_username", { fields: ["username"], unique: true })
	.index("user_email", { fields: ["email"], unique: true });

export const post = table("post", {
	uuid: t.uuid().default("rand::uuid::v7()"),
	content: t
		.string()
		.assert("$value != NONE")
		.assert("string::len($value) >= 1 AND string::len($value) <= 5000"),
	author: t.record("user"),
	hashtags: t.array(t.string()).default([]),
	likeCount: t.int().default(0),
	isPublic: t.bool().default(true),
	createdAt: t.date().valueExpr("time::now()"),
})
	.index("post_author", { fields: ["author"] })
	.index("post_public", { fields: ["isPublic", "createdAt"] });

export const comment = table("comment", {
	uuid: t.uuid().default("rand::uuid::v7()"),
	content: t
		.string()
		.assert("$value != NONE")
		.assert("string::len($value) >= 1 AND string::len($value) <= 2000"),
	author: t.record("user"),
	post: t.record("post"),
	likeCount: t.int().default(0),
	createdAt: t.date().valueExpr("time::now()"),
}).index("comment_post", { fields: ["post", "createdAt"] });

export const notification = table("notification", {
	uuid: t.uuid().default("rand::uuid::v7()"),
	recipient: t.record("user"),
	// `type` is the kind of notification, not a SurrealQL type.
	type: t.string().assert("$value != NONE"),
	message: t.string().assert("$value != NONE"),
	isRead: t.bool().default(false),
	createdAt: t.date().valueExpr("time::now()"),
}).index("notification_unread", { fields: ["recipient", "isRead"] });

export const follows = edge("user", "follows", "user", {
	createdAt: t.date().valueExpr("time::now()"),
	notificationsEnabled: t.bool().default(true),
});

export const liked = edge("user", "liked", "post", {
	createdAt: t.date().valueExpr("time::now()"),
});

export default [user, post, comment, notification, follows, liked];
