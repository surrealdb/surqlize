# Functions: api

Coverage list: `invoke`, `timeout`, `req::body`, `res::body`, `res::status`, `res::header`, `res::headers`.

```surql
RETURN api::invoke("/hello", { method: "GET" });
RETURN api::timeout();
RETURN api::req::body();
RETURN api::res::status();
RETURN api::res::header("content-type");
RETURN api::res::headers();
```

```ts
fn.api.invoke("/hello", { method: "GET" });
fn.api.timeout();
fn.api.req.body();
fn.api.res.status();
fn.api.res.header("content-type");
fn.api.res.headers();
```

Type-safety target:

- API functions are only meaningful in API contexts; types can expose the functions but docs should mark contextual validity.
- Request/response body helpers should allow typed generic payloads.

