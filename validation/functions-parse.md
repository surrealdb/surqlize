# Functions: parse

Coverage list: `email::host`, `email::user`, `url::domain`, `url::fragment`, `url::host`, `url::path`, `url::port`, `url::query`, `url::scheme`.

```surql
RETURN parse::email::host("root@example.com");
RETURN parse::email::user("root@example.com");
RETURN parse::url::domain("https://docs.surrealdb.com/path?q=1");
RETURN parse::url::path("https://docs.surrealdb.com/path?q=1");
RETURN parse::url::query("https://docs.surrealdb.com/path?q=1");
```

```ts
fn.parse.email.host("root@example.com");
fn.parse.email.user("root@example.com");
fn.parse.url.domain("https://docs.surrealdb.com/path?q=1");
fn.parse.url.path("https://docs.surrealdb.com/path?q=1");
fn.parse.url.query("https://docs.surrealdb.com/path?q=1");
```

Type-safety target:

- URL/email parse functions return optional strings/numbers where invalid input can yield `NONE`.
- Keep nested namespaces in the generated registry.

