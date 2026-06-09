# Statement: SELECT

Source coverage: `statements/select`, `statements/select/*`, `planner`, `indexes`, parser `stmts/select.surql`.

```surql
SELECT * FROM foo;
SELECT a AS b, c FROM foo, bar;
SELECT * FROM ONLY foo WITH INDEX a, b;
SELECT * FROM ONLY foo WITH NO INDEX WHERE 1 == 2 SPLIT ON a, b;
SELECT * FROM ONLY foo WHERE 1 == 2 GROUP BY a, b ORDER BY a LIMIT 1 START 1 VERSION 1 TIMEOUT 1s TEMPFILES;
SELECT count() FROM t GROUP ALL EXPLAIN;
EXPLAIN ANALYZE SELECT id FROM t WHERE id[1] = o:1 AND b = 2025;
```

```ts
db.select("foo").all();

db.select(["foo", "bar"]).return((r) => ({
  b: r.a,
  c: r.c,
}));

db.select("foo")
  .only()
  .withIndex("a", "b")
  .where((r) => q.eq(1, 2))
  .split("a", "b")
  .groupBy("a", "b")
  .orderBy("a")
  .limit(1)
  .start(1)
  .version(1)
  .timeout("1s")
  .tempfiles();

db.select("t")
  .return({ total: fn.count() })
  .groupAll()
  .explain();

db.explain({ analyze: true }, db.select("t").where((t) => t.id.index(1).eq(q.rid("o", 1))));
```

API implications:

- `FROM` accepts table, record id, array/object/range expressions, `NONE`, `NULL`, subqueries, and multiple sources.
- `ONLY`, `WITH INDEX`, `WITH NO INDEX`, `VERSION`, `TEMPFILES`, and `EXPLAIN` should be first-class clauses.
- A select statement must be usable as `Expr<Row[]>` before await.

