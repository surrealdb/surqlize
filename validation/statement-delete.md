# Statement: DELETE

Source coverage: parser `stmts/delete.surql`, `statements/delete`.

```surql
DELETE a;
DELETE a, b;
DELETE ONLY a, b WITH NOINDEX;
DELETE ONLY a, b WITH INDEX a, b WHERE foo == 1 TIMEOUT 1s EXPLAIN FULL;
DELETE person WHERE age < 18 RETURN BEFORE;
```

```ts
db.delete("a");
db.delete(["a", "b"]);

db.delete(["a", "b"])
  .only()
  .noIndex();

db.delete(["a", "b"])
  .only()
  .withIndex("a", "b")
  .where((r) => r.foo.eq(1))
  .timeout("1s")
  .explain({ full: true });

db.delete("person")
  .where((p) => p.age.lt(18))
  .return("BEFORE");
```

API implications:

- Delete accepts the same target richness as select/update: table, record, array, subquery, parameter.
- The output type depends on `RETURN`, so the builder must carry output state.

