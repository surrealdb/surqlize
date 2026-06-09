# Functions: schema

Coverage list: `schema::table::exists`.

```surql
RETURN schema::table::exists("person");
RETURN schema::table::exists(type::table("person"));
```

```ts
fn.schema.table.exists("person");
fn.schema.table.exists(fn.type.table("person"));
```

Type-safety target:

- Schema functions are server-context functions and should remain expression-safe before await.
- Table arguments should accept table literals and table expressions.

