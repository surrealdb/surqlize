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

A type-safe TypeScript ORM for SurrealDB that provides full type inference, a fluent query builder, and first-class support for graph relationships, database functions.

## Features

- **Type-safe schema definitions** - Define your database schema using intuitive `t.*` builders
- **Automatic type inference** - Get full TypeScript types without code generation
- **Fluent query builder** - Chain `.select()`, `.where()`, `.return()` with full type safety
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
import Surreal from "surrealdb";
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

## Query building

### Basic queries

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

// Select a single record
const specificUser = db.select(new RecordId("user", "john"));
```

### Filtering operations

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

  // Fuzzy matching
  user.name.fy("John")              // ~ (fuzzy)
  user.name.nf("Jane")              // !~ (not fuzzy)

  // Array membership
  user.status.inside(["active", "pending"])    // IN
  user.status.notInside(["banned", "deleted"]) // NOT IN

  // Logical operators
  user.age.gte(18).and(user.isActive.eq(true))
  user.role.eq("admin").or(user.role.eq("moderator"))
  user.isActive.not()
);
```

### Type-specific functions

#### String functions

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

#### Array functions

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

#### Record functions

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

### Complex example

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

## Comparison with other ORMs

| Feature | Surqlize | Prisma | Drizzle | SurrealDB.js | TypeORM |
|---------|----------|--------|---------|--------------|---------|
| SurrealDB Support | ✅ Native | ❌ | ❌ | ✅ Official | ❌ |
| Type Inference | ✅ Full, no codegen | ✅ Via codegen | ✅ Full | ⚠️ Partial | ⚠️ Decorators |
| Graph/Edges | ✅ First-class | ❌ | ❌ | ✅ Manual | ❌ |
| Query Builder | ✅ Type-safe | ⚠️ Limited | ✅ Type-safe | ⚠️ String-based | ✅ Query Builder |
| Fluent API | ✅ | ⚠️ | ✅ | ❌ | ✅ |
| Runtime Validation | 🚧 Planned | ✅ | ❌ | ❌ | ✅ |

**Why Surqlize?**

- **Native SurrealDB support**: Built specifically for SurrealDB's unique features including graph relationships, flexible schemas, and SurrealQL
- **No code generation**: Full type inference using TypeScript's type system—no build step required
- **Fluent API**: Natural, chainable syntax that mirrors SurrealQL while providing complete type safety
- **Graph-first**: Edges and relationships are first-class citizens, not an afterthought

## Roadmap

This project is in active development. Planned features include:

- [ ] **Additional SurrealDB functions** - Math, time, crypto, geo, and more
- [ ] **CRUD operations** - INSERT, UPDATE, DELETE, CREATE statements
- [ ] **RELATE statements** - Create graph edges directly in queries
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
