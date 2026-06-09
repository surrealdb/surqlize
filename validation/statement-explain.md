# Statement: EXPLAIN

Source coverage: `statements/explain`, planner/index tests.

```surql
EXPLAIN SELECT * FROM student WHERE marks.*.mark = 40;
EXPLAIN ANALYZE SELECT count() AS total FROM sale GROUP ALL;
SELECT name FROM person WHERE name @@ "Jaime" EXPLAIN;
UPDATE ONLY foo SET a += 1 RETURN DIFF EXPLAIN FULL;
```

```ts
db.explain(db.select("student").where((s) => s.marks.all().mark.eq(40)));

db.explain(
  { analyze: true },
  db.select("sale").return({ total: fn.count() }).groupAll(),
);

db.select("person")
  .where((p) => p.name.matches("Jaime"))
  .explain();

db.update("foo")
  .only()
  .set((r) => [r.a.inc(1)])
  .return("DIFF")
  .explain({ full: true });
```

API implications:

- SurrealQL has both prefix `EXPLAIN [ANALYZE] <statement>` and trailing statement `EXPLAIN [FULL]` forms.
- Explain output should be a distinct type from the wrapped statement output.

