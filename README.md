<br>

<p align="center">
    <img width=120 src="https://raw.githubusercontent.com/surrealdb/icons/main/surreal.svg" />
    &nbsp;
    <img width=120 src="https://raw.githubusercontent.com/surrealdb/icons/main/javascript.svg" />
</p>

<h3 align="center">A type-safe TypeScript ORM for SurrealDB.</h3>

<br>

<p align="center">
    <a href="https://github.com/surrealdb/surqlize"><img src="https://img.shields.io/badge/status-dev-ff00bb.svg?style=flat-square"></a>
    &nbsp;
    <a href="https://surrealdb.com/docs/sdk/javascript"><img src="https://img.shields.io/badge/docs-view-44cc11.svg?style=flat-square"></a>
    &nbsp;
    <a href="https://www.npmjs.com/package/surqlize"><img src="https://img.shields.io/npm/v/surqlize?style=flat-square"></a>
    <!--&nbsp;
    <a href="https://www.npmjs.com/package/surqlize"><img src="https://img.shields.io/npm/dm/surqlize?style=flat-square"></a>
    &nbsp;
    <a href="https://deno.land/x/surqlize"><img src="https://img.shields.io/npm/v/surqlize?style=flat-square&label=deno"></a>-->
</p>

<p align="center">
    <a href="https://surrealdb.com/discord"><img src="https://img.shields.io/discord/902568124350599239?label=discord&style=flat-square&color=5a66f6"></a>
    &nbsp;
    <a href="https://twitter.com/surrealdb"><img src="https://img.shields.io/badge/twitter-follow_us-1d9bf0.svg?style=flat-square"></a>
    &nbsp;
    <a href="https://www.linkedin.com/company/surrealdb/"><img src="https://img.shields.io/badge/linkedin-connect_with_us-0a66c2.svg?style=flat-square"></a>
    &nbsp;
    <a href="https://www.youtube.com/@SurrealDB"><img src="https://img.shields.io/badge/youtube-subscribe-fc1c1c.svg?style=flat-square"></a>
</p>

# Surqlize

> **⚠️ Experimental**: This project is in early development and the API may change significantly.

A type-safe TypeScript ORM for SurrealDB that provides full type inference, a fluent query builder, comprehensive CRUD operations, and first-class support for graph relationships, and database functions.

## Features

- **Type-safe schema definitions** - Define your database schema using intuitive `t.*` builders
- **Automatic type inference** - Get full TypeScript types without code generation
- **Fluent query builder** - Chain `.select()`, `.where()`, `.return()` with full type safety
- **Complete CRUD operations** - SELECT, CREATE, UPDATE, DELETE, and UPSERT queries
- **Graph relationships** - First-class support for edges and graph traversal
- **Rich type system** - Objects, arrays, unions, literals, options, and more
- **SurrealDB functions** - Integrated string, array, and record operations

## Installation

```bash
bun add surqlize
# or
npm install surqlize
```

## Quick start

```typescript
import { Surreal } from "surrealdb";
import { orm, table, t } from "surqlize";

// Define a table schema
const user = table("user", {
  name: t.string(),
  email: t.string(),
  age: t.number(),
  created: t.date(),
});

// Create ORM instance
const db = orm(new Surreal(), user);

// Build type-safe queries
const query = db
  .select("user")
  .where((user) => user.age.gte(18))
  .return((user) => ({
    name: user.name,
    email: user.email,
  }));

// TypeScript knows the exact return type!
type Result = t.infer<typeof query>;
// Result: Array<{ name: string; email: string }>
```

## Schema definition

### Tables

Define tables using the `table()` function with a rich type system:

```typescript
import { table, t } from "surqlize";

const user = table("user", {
  // Basic types
  name: t.string(),
  age: t.number(),
  isActive: t.bool(),
  created: t.date(),
  userId: t.uuid(),

  // Complex objects
  address: t.object({
    street: t.string(),
    city: t.string(),
    zipCode: t.string(),
  }),

  // Arrays
  tags: t.array(t.string()),
  scores: t.array(t.number()),

  // Mixed-type arrays (tuples)
  mixedData: t.array([t.string(), t.number(), t.bool()]),

  // Optional fields
  bio: t.option(t.string()),
  
  // Record references (foreign keys)
  authorId: t.record("author"),

  // Union types
  status: t.union([
    t.literal("active"),
    t.literal("inactive"),
    t.literal("pending"),
  ]),

  // Literals
  role: t.literal("admin"),
});
```

**Note**: Every table automatically includes an `id` field of type `RecordId<TableName>`.

### Edges and graph relations

Define graph edges to model relationships between tables:

```typescript
import { edge, table, t } from "surqlize";

const user = table("user", {
  name: t.string(),
  email: t.string(),
});

const post = table("post", {
  title: t.string(),
  content: t.string(),
});

// Define an edge from user to post
const authored = edge("user", "authored", "post", {
  created: t.date(),
  role: t.union([t.literal("author"), t.literal("co-author")]),
});

const db = orm(new Surreal(), user, post, authored);
```

**Automatic fields**: Edges automatically include:
- `id`: RecordId of the edge
- `in`: RecordId of the source table (user)
- `out`: RecordId of the target table (post)

## CRUD Operations

### SELECT statements

```typescript
// Select all records
const allUsers = db.select("user");

// Select with WHERE clause
const adults = db
  .select("user")
  .where((user) => user.age.gte(18));

// Project specific fields with RETURN
const userNames = db
  .select("user")
  .return((user) => ({
    fullName: user.name,
    email: user.email,
  }));

// Pagination
const paginatedUsers = db
  .select("user")
  .start(10)
  .limit(20);

// Select a single record by ID (returns array with 0 or 1 item)
const specificUser = await db.select(new RecordId("user", "john"));
// To get the first item, use .val() or .at(0):
const specificUser = await db.select(new RecordId("user", "john")).then.val();
// Or get a specific item:
const specificUser = await db.select(new RecordId("user", "john")).then.at(0);

// Nested queries (JOIN-like)
const postsWithAuthors = db.select("post").return((post) => ({
  title: post.title,
  author: post.authorId.select().return((author) => ({
    name: author.name,
    email: author.email,
  })),
}));
```

### CREATE statements

Create a new record with a specific id or a generated id.

```typescript
// Create with SET
const newUser = await db.create("user").set({
  name: "Alice",
  email: "alice@example.com",
  age: 30,
  created: new Date(),
});

// Create with CONTENT
const newPost = await db.create("post").content({
  title: "Hello World",
  body: "First post!",
  authorId: new RecordId("user", "alice"),
  published: true,
});

// Create with explicit ID
const user = await db.create("user", "alice123").set({
  name: "Alice",
  email: "alice@example.com",
});

// Control return value
const created = await db.create("user")
  .set({ name: "Bob" })
  .return("after"); // or "before", "none", "diff"
```

### INSERT statements

Insert one or multiple records with support for bulk operations and conflict handling.

```typescript
// Insert single record (object style)
await db.insert("user", {
  name: "Alice",
  email: "alice@example.com",
  age: 30,
});

// Bulk insert (object style)
await db.insert("user", [
  { name: "Alice", email: "alice@example.com", age: 30 },
  { name: "Bob", email: "bob@example.com", age: 25 },
  { name: "Charlie", email: "charlie@example.com", age: 28 },
]);

// VALUES tuple syntax
await db.insert("user")
  .fields(["name", "email", "age"])
  .values(
    ["Alice", "alice@example.com", 30],
    ["Bob", "bob@example.com", 25]
  );

// IGNORE duplicates (skip conflicts silently)
await db.insert("user", userData).ignore();

// ON DUPLICATE KEY UPDATE (update on conflict)
await db.insert("user", { 
  id: "alice", 
  name: "Alice", 
  age: 30 
})
.onDuplicate({
  age: { "+=": 1 },
  lastSeen: new Date(),
});

// With operators in ON DUPLICATE
await db.insert("post", posts)
  .onDuplicate({
    views: { "+=": 1 },
    tags: { "+=": ["updated"] },
  });

// With RETURN clause
const inserted = await db.insert("user", data).return("after");

// With RETURN projection
const insertedNames = await db.insert("user", data)
  .return(u => ({ name: u.name }));
```

### UPSERT statements

Create a record if it doesn't exist, update records if matching records exist.

```typescript
// Upsert with SET
await db.upsert("user", "alice")
  .set({
    name: "Alice",
    email: "alice@example.com",
    age: 30,
  });

// Upsert with operators (atomic increment)
await db.upsert("pageview", "homepage")
  .set({
    count: { "+=": 1 },
    lastViewed: new Date(),
  });

// Upsert with MERGE
await db.upsert("user", "alice")
  .merge({ lastLogin: new Date() });

// Bulk upsert with WHERE
await db.upsert("user")
  .where((u) => u.email.eq("alice@example.com"))
  .set({ lastSeen: new Date() });
```

### UPDATE statements

Update a record or multiple records in a table.

```typescript
// Update with SET
await db.update("user", "alice")
  .set({ age: 31 });

// Bulk update with WHERE
await db.update("user")
  .where((u) => u.age.lt(18))
  .set({ status: "minor" });

// Array and number operators
await db.update("user", "alice")
  .set({
    age: { "+=": 1 },                // Increment
    tags: { "+=": ["developer"] },   // Append to array
    oldTags: { "-=": ["beginner"] }, // Remove from array
  });

// CONTENT (replace entire record)
await db.update("user", "alice")
  .content({
    name: "Alice Smith",
    email: "alice@example.com",
    age: 31,
  });

// MERGE (partial update)
await db.update("user", "alice")
  .merge({ email: "newemail@example.com" });

// PATCH (JSON Patch operations)
await db.update("user", "alice")
  .patch([
    { op: "replace", path: "/age", value: 32 },
    { op: "remove", path: "/oldField" },
  ]);

// UNSET (remove fields)
await db.update("user", "alice")
  .set({ name: "Alice" })
  .unset(["oldField1", "oldField2"]);

// Return modified records
const updated = await db.update("user")
  .where((u) => u.age.gt(65))
  .set({ status: "senior" })
  .return("after");
```

### RELATE statements

Create graph edges between records using defined edge schemas.

```typescript
// Single edge between two records
const edge = await db.relate(
  "authored",
  new RecordId("user", "alice"),
  new RecordId("post", "hello-world")
);

// With edge data using content()
const friendship = await db.relate(
  "knows",
  new RecordId("user", "user1"),
  new RecordId("user", "user2")
).content({
  since: new Date(),
  strength: 5,
});

// With edge data using set()
const likes = await db.relate(
  "likes",
  new RecordId("user", "userId"),
  new RecordId("post", "postId")
).set({
  created: new Date(),
  rating: 5,
});

// Cartesian product: create multiple edges
// Creates: alice->authored->post1, alice->authored->post2,
//          bob->authored->post1, bob->authored->post2
const edges = await db.relate(
  "authored",
  [new RecordId("user", "alice"), new RecordId("user", "bob")],
  [new RecordId("post", "post1"), new RecordId("post", "post2")]
);

// Control return mode
await db.relate(
  "authored",
  new RecordId("user", "user"),
  new RecordId("post", "post")
).content({ created: new Date() })
.return("after"); // or "before", "none", "diff"

// With return projection
const edgeInfo = await db.relate(
  "follows",
  new RecordId("user", "follower"),
  new RecordId("user", "followee")
).set({ since: new Date() })
.return(edge => ({
  id: edge.id,
  from: edge.in,
  to: edge.out,
  since: edge.since,
}));


// Using with query results
const userQuery = db.select("user", "alice");
const postQuery = db.select("post", "hello");
await db.relate("authored", userQuery, postQuery);
```

### DELETE statements

```typescript
// Delete single record (returns array with 0 or 1 item)
await db.delete("user", "alice");

// Bulk delete with WHERE
await db.delete("user")
  .where((u) => u.age.lt(13));

// Return deleted records
const deleted = await db.delete("user")
  .where((u) => u.status.eq("inactive"))
  .return("before");

// Delete with projection
const deletedNames = await db.delete("user")
  .where((u) => u.email.endsWith("@spam.com"))
  .return((u) => ({ name: u.name }));
```

## Accessing Single Records

All queries in Surqlize return arrays, even when selecting by a specific record ID. To access the first item from a query result, use `.val()` or `.at(index)`:

```typescript
// .val() - Returns the first item or undefined
const user = await db.select("user", "alice").then.val();
// user: User | undefined

// .at(index) - Returns the item at the specified index or undefined
const firstUser = await db.select("user").then.at(0);
const secondUser = await db.select("user").then.at(1);
const lastUser = await db.select("user").then.at(-1); // negative indexing supported

// Working with arrays directly
const users = await db.select("user", "alice");
// users: User[]
if (users.length > 0) {
  const user = users[0];
}

// Use with update, delete, and upsert
const updated = await db.update("user", "alice")
  .set({ age: 31 })
  .return("after")
  .then.val();

const deleted = await db.delete("user", "alice")
  .return("before")
  .then.val();
```

## Filtering operations

All types support these comparison operators:

```typescript
db.select("user").where((user) => 
  // Equality
  user.name.eq("John")              // =
  user.age.ne(25)                   // !=
  user.email.ex("john@example.com") // == (exact match)

  // Comparison
  user.age.gt(18)                   // >
  user.age.gte(21)                  // >=
  user.age.lt(65)                   // <
  user.age.lte(64)                  // <=

  // Array membership
  user.status.inside(["active", "pending"])    // IN
  user.status.notInside(["banned", "deleted"]) // NOT IN

  // Logical operators
  user.age.gte(18).and(user.isActive.eq(true))
  user.role.eq("admin").or(user.role.eq("moderator"))
  user.isActive.not()
);
```

## Type-specific functions

### String functions

```typescript
db.select("user").where((user) =>
  user.email.startsWith("admin@")
  user.name.endsWith("son")
);

db.select("user").return((user) => ({
  fullName: user.firstName.join(" ", user.lastName),
  nameLength: user.name.len(),
}));
```

### Array functions

```typescript
db.select("user").where((user) =>
  user.tags.contains("typescript")
  user.tags.containsAll(["javascript", "typescript"])
  user.tags.containsAny(["rust", "go", "python"])
  user.tags.containsNone(["php", "perl"])
);

db.select("post").return((post) => ({
  title: post.title,
  firstTag: post.tags.at(0),
  tagCount: post.tags.len(),
}));
```

### Record functions

When you have a record reference, you can perform nested queries:

```typescript
const post = table("post", {
  title: t.string(),
  authorId: t.record("user"),
});

// Nested query with .select()
const query = db.select("post").return((post) => ({
  title: post.title,
  author: post.authorId.select().return((author) => ({
    name: author.name,
    email: author.email,
  })),
}));

// TypeScript infers the complete nested type!
type Result = t.infer<typeof query>;
// Result: Array<{
//   title: string;
//   author: { name: string; email: string } | undefined;
// }>
```

## Advanced Features

### Return Clauses

Control what gets returned from mutations:

```typescript
// Return nothing
await db.update("user", "alice").set({ age: 31 }).return("none");

// Return state before modification
const before = await db.update("user", "alice")
  .set({ age: 31 })
  .return("before");

// Return state after modification (default)
const after = await db.update("user", "alice")
  .set({ age: 31 })
  .return("after");

// Return diff of changes
const diff = await db.update("user", "alice")
  .set({ age: 31 })
  .return("diff");

// Return specific fields with projection
const projection = await db.update("user", "alice")
  .set({ age: 31, email: "new@email.com" })
  .return((u) => ({ name: u.name, age: u.age }));
```

### Query Timeouts

```typescript
const users = await db.select("user")
  .where((u) => u.age.gt(18))
  .timeout("5s");

await db.update("user", "alice")
  .set({ age: 31 })
  .timeout("10s");
```

### Operators

Use operators for atomic operations:

```typescript
// Increment/decrement numbers
db.update("user", "alice").set({
  age: { "+=": 1 },
  score: { "-=": 10 },
});

// Add/remove from arrays
db.update("post", "post1").set({
  tags: { "+=": ["typescript", "database"] },
  oldTags: { "-=": ["deprecated"] },
});
```

## Type inference

Extract TypeScript types from your queries using `t.infer<>`:

```typescript
// Infer query result type
const query = db.select("user").return((user) => ({
  name: user.name,
  age: user.age,
}));

type QueryResult = t.infer<typeof query>;
// QueryResult: Array<{ name: string; age: number }>

// Infer table type
const userTable = table("user", {
  name: t.string(),
  age: t.number(),
});

type User = t.infer<typeof userTable>;
// User: { id: RecordId<"user">; name: string; age: number }

// Infer individual type definitions
const emailType = t.string();
type Email = t.infer<typeof emailType>;
// Email: string
```

## Debugging Queries

Inspect generated SurrealQL:

```typescript
import { displayContext, __display } from "surqlize";

const query = db.select("user").where((u) => u.age.gte(18));

const ctx = displayContext();
const sql = query[__display](ctx);

console.log(sql);           // Generated SurrealQL
console.log(ctx.variables); // Parameterized values
```

## Graph relationships

Surqlize provides type-safe graph traversal through the `lookup` system:

```typescript
const user = table("user", { name: t.string() });
const post = table("post", { title: t.string() });
const authored = edge("user", "authored", "post", {});

const db = orm(new Surreal(), user, post, authored);

// TypeScript knows which edges connect to which tables
db.lookup.to;   // { user: ["authored"], authored: ["post"], post: [] }
db.lookup.from; // { user: [], authored: ["user"], post: ["authored"] }

// Use in queries for type-safe graph navigation
// (This feature is under active development)
```

## Complex example

Here's a complete example showcasing multiple features:

```typescript
const user = table("user", {
  name: t.object({
    first: t.string(),
    last: t.string(),
  }),
  age: t.number(),
  email: t.string(),
  tags: t.array(t.string()),
  bio: t.option(t.string()),
});

const post = table("post", {
  title: t.string(),
  content: t.string(),
  authorId: t.record("user"),
  created: t.date(),
});

const authored = edge("user", "authored", "post", {
  created: t.date(),
});

const db = orm(new Surreal(), user, post, authored);

// Complex query with nested data and string operations
const query = db
  .select("post")
  .where((post) => 
    post.title.startsWith("Guide").and(
      post.created.gte(new Date("2024-01-01"))
    )
  )
  .return((post) => ({
    title: post.title,
    author: post.authorId.select().return((author) => ({
      fullName: author.name.first.join(" ", author.name.last),
      age: author.age,
      hasBio: author.bio.trueish(),
    })),
  }))
  .limit(10);

// Fully typed result
type Result = t.infer<typeof query>;
```

## Comparison with other ORMs

| Feature | Surqlize | SurrealDB.js | Prisma | Drizzle | TypeORM |
|---------|----------|--------------|--------|---------|---------|
| SurrealDB support | ✅ | ✅ | ❌ | ❌ | ❌ |
| Schema definition | ✅ <sup><sub>Code-first</sub></sup> | ❌ | ✅ <sup><sub>Schema file</sub></sup> | ✅ <sup><sub>Code-first</sub></sup> | ⚠️ <sup><sub>Decorators</sub></sup> |
| Type inference | ✅ <sup><sub>Full</sub></sup> | ⚠️ <sup><sub>Partial</sub></sup> | ✅ <sup><sub>With codegen</sub></sup> | ✅ <sup><sub>Full</sub></sup> | ⚠️ <sup><sub>Decorators</sub></sup> |
| CRUD operations | ✅ <sup><sub>All operations</sub></sup> | ✅ | ✅ | ✅ | ✅ |
| Graph and edges | ✅ <sup><sub>Native</sub></sup> | ✅ <sup><sub>Manual</sub></sup> | ❌ | ❌ | ❌ |
| Query builder | ✅ <sup><sub>Type-safe</sub></sup> | ⚠️ <sup><sub>Manual</sub></sup> | ⚠️ <sup><sub>Limited</sub></sup> | ✅ <sup><sub>Type-safe</sub></sup> | ✅ <sup><sub>Query builder</sub></sup> |
| Database Functions | ✅ <sup><sub>Integrated</sub></sup> | ⚠️ <sup><sub>Manual</sub></sup> | ⚠️ <sup><sub>Limited</sub></sup> | ✅ <sup><sub>SQL functions</sub></sup> | ✅ <sup><sub>Query functions</sub></sup> |
| Nested Queries | ✅ <sup><sub>Type-safe</sub></sup> | ⚠️ <sup><sub>Manual</sub></sup> | ✅ <sup><sub>Relations</sub></sup> | ✅ <sup><sub>Joins</sub></sup> | ✅ <sup><sub>Relations</sub></sup> |
| Fluent API | ✅ | ❌ | ❌ | ✅ | ✅ |

**Why Surqlize?**

- **Native SurrealDB support**: Built specifically for SurrealDB's unique features including graph relationships, flexible schemas, and SurrealQL
- **No code generation**: Full type inference using TypeScript's type system—no build step required
- **Fluent API**: Natural, chainable syntax that mirrors SurrealQL while providing complete type safety
- **Graph-first**: Edges and relationships are first-class citizens, not an afterthought
- **Complete CRUD**: Full support for SELECT, CREATE, UPDATE, DELETE, and UPSERT operations

## Roadmap

This project is in active development. Planned features include:

- [ ] **Additional SurrealDB functions** - Math, time, crypto, geo, and more
- [ ] **RELATE statements** - Create graph edges directly in queries
- [ ] **Advanced query clauses** - ORDER BY, GROUP BY, FETCH, SPLIT
- [ ] **Transaction support** - BEGIN, COMMIT, CANCEL transactions
- [ ] **Runtime validation** - Validate data at runtime using schema definitions
- [ ] **Advanced graph traversal** - Path finding, recursive queries, graph algorithms
- [ ] **Performance optimizations** - Query caching, connection pooling
- [ ] **Schema migrations** - Version control for database schemas
- [ ] **Documentation site** - Comprehensive guides and API reference

## Development

```bash
# Install dependencies
bun install

# Run the example file
bun run index.ts

# Lint and format
bun run qc   # Check for issues
bun run qa   # Auto-fix issues
bun run qau  # Auto-fix with unsafe changes
```

## Contributing

Contributions are welcome! This project is in an experimental stage, so expect breaking changes. If you'd like to contribute:

1. Open an issue to discuss your idea
2. Fork the repository
3. Create a feature branch
4. Submit a pull request

Please ensure your code passes the linting checks (`bun run qc`).

## License

[Specify license here - check package.json or add LICENSE file]

---

**Built with ❤️ for the SurrealDB community**
