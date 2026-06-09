# Functions: session

Coverage list: `ac`, `db`, `id`, `ip`, `ns`, `origin`, `rd`, `token`.

```surql
RETURN session::db();
RETURN session::ns();
RETURN session::id();
RETURN session::token();
SELECT * FROM person WHERE tenant = session::db();
```

```ts
fn.session.db();
fn.session.ns();
fn.session.id();
fn.session.token();

db.select("person").where((p) => p.tenant.eq(fn.session.db()));
```

Type-safety target:

- Session functions take no user arguments and return context-derived option/string/object values.
- They are normal expressions and should work in permissions, events, fields, and queries.

