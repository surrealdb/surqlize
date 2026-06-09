# Statement Embedding: Actionable Before Await

Source coverage: `statements/select/writable_subqueries*.surql`, `subquery/*.surql`, `script/value_params.surql`.

```surql
LET $id = (UPSERT tester:test);
RETURN $id;

LET $id = (UPSERT tester:test).id;
RETURN $id;

LET $id = (SELECT VALUE id FROM (UPSERT tester:test))[0];
RETURN $id;

SELECT *, (SELECT id, name FROM $this.tags) AS tags FROM person;
RETURN string::concat("id=", (CREATE ONLY thing).id);
```

```ts
db.let("id").eq(db.upsert(q.rid("tester", "test")));
q.return(q.param("id"));

db.let("id").eq(db.upsert(q.rid("tester", "test")).id);
q.return(q.param("id"));

db.let("id").eq(
  db.select(db.upsert(q.rid("tester", "test")))
    .value((r) => r.id)
    .index(0),
);
q.return(q.param("id"));

db.select("person").return((p) => ({
  ...p.all(),
  tags: db.select(p.$this.tags).return((tag) => ({ id: tag.id, name: tag.name })),
}));

q.return(fn.string.concat("id=", db.create(q.rid("thing")).only().id));
```

API implications:

- `Actionable<T>` should be a capability layered onto `Expr<T>`, not a separate shape that needs `wrap()`.
- Awaiting/executing consumes the action; every unawaited action remains composable.
- Path parts, function arguments, `LET`, projections, and statement targets all need `IntoExpr<T>` inputs.
- The TypeScript API should make accidental await visible: after `await`, the value is JavaScript data and cannot be further composed into SurrealQL.

