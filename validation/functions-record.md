# Functions: record

Coverage list: `id`, `table`, `tb`, `exists`, `is_edge`.

```surql
RETURN record::id(person:one);
RETURN record::table(person:one);
RETURN record::tb(person:one);
RETURN record::exists(person:one);
RETURN record::is_edge(knows:one);
```

```ts
fn.record.id(q.rid("person", "one"));
fn.record.table(q.rid("person", "one"));
fn.record.tb(q.rid("person", "one"));
fn.record.exists(q.rid("person", "one"));
fn.record.isEdge(q.rid("knows", "one"));
```

Type-safety target:

- `record::id` returns the structured id component.
- `record::table`/`tb` return table names.
- `record::exists` and `record::is_edge` are async server functions but remain expression-safe before await.

