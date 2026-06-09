# Functions: http

Coverage list: `head`, `get`, `put`, `post`, `patch`, `delete`.

```surql
RETURN http::get("https://example.com/data.json");
RETURN http::post("https://example.com/items", { name: "one" });
RETURN http::patch("https://example.com/items/1", { name: "two" });
RETURN http::delete("https://example.com/items/1");
```

```ts
fn.http.get("https://example.com/data.json");
fn.http.post("https://example.com/items", { name: "one" });
fn.http.patch("https://example.com/items/1", { name: "two" });
fn.http.delete("https://example.com/items/1");
```

Type-safety target:

- HTTP functions are async server functions; they must still be `Expr<T>` until query execution.
- Allow generic response typing: `fn.http.get<MyShape>(url)`.

