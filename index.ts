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

const query = db.select("post").return((post) => ({
	title: post.title,
	author: post.author.select().return((author) => ({
		name: author.name,
		age: author.age,
	})),
}));

db.select("user").where(($this) => $this.name.first.eq("John"));

db.select("user").return((user) =>
	user.extend({
		fullName: user.name.first.join(" ", user.name.last),
	}),
);

const bla = db.select("foo").then.at(0).eq({ title: "Hello, World!" });

db.lookup.to;

type a = t.infer<typeof query>;

console.log(query[__display](ctx));
console.log(ctx.variables);

// ============================================
// NEW CRUD OPERATIONS EXAMPLES
// ============================================

// CREATE examples
const createUser = db.create("user").set({
	name: { first: "Alice", last: "Smith" },
	age: 30,
	email: "alice@example.com",
	created: new Date(),
	updated: new Date(),
	metadata: {
		bio: "Software Engineer",
		avatar: "avatar.jpg",
		eq: { value: true },
	},
	props: ["test", 123, true],
	tags: ["developer", "typescript"],
});

const createWithId = db.create("user", "alice123").content({
	name: { first: "Alice", last: "Smith" },
	age: 30,
	email: "alice@example.com",
	created: new Date(),
	updated: new Date(),
	metadata: {
		bio: "Software Engineer",
		avatar: "avatar.jpg",
		eq: { value: true },
	},
	props: ["test", 123, true],
	tags: ["developer", "typescript"],
});

// UPDATE examples
const updateBulk = db
	.update("user")
	.where(($this) => $this.age.lt(18))
	.set({ opt: "minor" });

const updateOne = db
	.update("user", "alice123")
	.set({ age: 31 })
	.return("after");

const updateWithOperators = db
	.update("user", "alice123")
	.set({
		age: { "+=": 1 }, // Increment age
		tags: { "+=": ["senior"] }, // Add tag to array
	});

const updateMerge = db.update("user", "alice123").merge({
	email: "newemail@example.com",
});

// DELETE examples
const deleteBulk = db
	.delete("user")
	.where(($this) => $this.age.gt(100))
	.return("before");

const deleteOne = db.delete("user", "inactive_user").return("before");

// UPSERT examples
const upsertUser = db.upsert("user", "alice123").set({
	name: { first: "Alice", last: "Smith" },
	age: 30,
	email: "alice@example.com",
	created: new Date(),
	updated: new Date(),
	metadata: {
		bio: "Software Engineer",
		avatar: "avatar.jpg",
		eq: { value: true },
	},
	props: ["test", 123, true],
	tags: ["developer", "typescript"],
});

const upsertWithIncrement = db.upsert("user", "alice123").set({
	age: { "+=": 1 },
});

// Display generated queries
console.log("\n=== CREATE ===");
console.log(createUser[__display](displayContext()));

console.log("\n=== UPSERT ===");
console.log(upsertUser[__display](displayContext()));

console.log("\n=== UPDATE ===");
console.log(updateBulk[__display](displayContext()));

console.log("\n=== DELETE ===");
console.log(deleteBulk[__display](displayContext()));