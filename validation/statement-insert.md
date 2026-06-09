# Statement: INSERT

Source coverage: parser `stmts/insert.surql`, `statements/insert`.

```surql
INSERT a;
INSERT RELATION a;
INSERT IGNORE INTO $param a;
INSERT IGNORE INTO table a;
INSERT (a, b, c.d) VALUES (1, 2, 3), (4, 5, 6);
INSERT a ON DUPLICATE KEY UPDATE a += 1;
INSERT a RETURN NONE;
INSERT a VERSION 1 TIMEOUT 1;
```

```ts
db.insert(q.value({ a: 1 }));
db.insertRelation(q.value({ in: q.rid("person", "one"), out: q.rid("person", "two") }));

db.insert(q.value({ a: 1 }))
  .ignore()
  .into(q.param("param"));

db.insert()
  .columns("a", "b", q.field("c.d"))
  .values([1, 2, 3], [4, 5, 6]);

db.insert({ a: 1 })
  .onDuplicate((r) => [r.a.inc(1)])
  .return("NONE")
  .version(1)
  .timeout(1);
```

API implications:

- `INSERT RELATION` is distinct from `RELATE`; it should validate relation-shaped values.
- `INTO` can target a table expression or parameter.
- Column lists must allow idioms, not only top-level field names.

