# Statement: UPDATE and UPSERT

Source coverage: parser `stmts/update.surql`, parser `stmts/upsert.surql`, `statements/update`, `statements/upsert`.

```surql
UPDATE ONLY foo WITH INDEX foo SET a += 1, b.c -= 1 WHERE foo = bar RETURN DIFF TIMEOUT 1s EXPLAIN FULL;
UPSERT person:tobie SET name = "Tobie";
UPSERT ONLY user:one CONTENT { name: "One" } RETURN AFTER;
UPSERT ONLY foo WITH NOINDEX MERGE { a: 1 } WHERE foo = bar RETURN a AS b.c;
```

```ts
db.update("foo")
  .only()
  .withIndex("foo")
  .set((r) => [r.a.inc(1), r.b.c.dec(1)])
  .where((r) => r.foo.eq(q.field("bar")))
  .return("DIFF")
  .timeout("1s")
  .explain({ full: true });

db.upsert(q.rid("person", "tobie")).set((p) => [p.name.assign("Tobie")]);

db.upsert(q.rid("user", "one"))
  .only()
  .content({ name: "One" })
  .return("AFTER");

db.upsert("foo")
  .only()
  .noIndex()
  .merge({ a: 1 })
  .where((r) => r.foo.eq(q.field("bar")))
  .return((r) => ({ "b.c": r.a }));
```

API implications:

- `UPDATE` and `UPSERT` share most clauses, but their runtime semantics differ; keep separate statement builders.
- `RETURN NONE | NULL | DIFF | BEFORE | AFTER | projection` should be typed as an output selector.
- `WITH INDEX` and `WITH NOINDEX` are planner directives, not where options.

