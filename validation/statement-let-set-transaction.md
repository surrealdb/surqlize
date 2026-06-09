# Statements: LET, SET, TRANSACTION

Source coverage: parser `stmts/let.surql`, `statements/let`, `statements/transaction`, executor transaction tests.

```surql
LET $name = "Tobie";
LET $items = SELECT * FROM item WHERE active = true;
BEGIN;
UPSERT test:name SET name = "Test";
RETURN test:name;
COMMIT;
CANCEL;
```

```ts
db.let("name").eq("Tobie");

db.let("items").eq(
  db.select("item").where((item) => item.active.eq(true)),
);

db.transaction((tx) => [
  tx.upsert(q.rid("test", "name")).set((r) => [r.name.assign("Test")]),
  q.return(q.rid("test", "name")),
]);

db.begin();
db.commit();
db.cancel();
```

API implications:

- `LET` should accept any `Expr<T>`, including unawaited statements.
- Transaction helpers should compile to `BEGIN; ...; COMMIT;` but still expose explicit statements for advanced use.

