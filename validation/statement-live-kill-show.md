# Statements: LIVE, KILL, SHOW

Source coverage: `statements/live`, parser `stmts/kill.surql`, parser `stmts/show.surql`, changefeed tests.

```surql
LIVE SELECT * FROM person WHERE active = true;
LIVE SELECT DIFF FROM person;
KILL u"2ba318c4-2267-4319-becd-3c60c237f1e2";
KILL $param;
SHOW CHANGES FOR TABLE foo SINCE 1 LIMIT 1 + 1;
SHOW CHANGES FOR DATABASE SINCE d"0000-01-01T00:00:00Z" LIMIT 1 + 1;
```

```ts
db.live("person")
  .where((p) => p.active.eq(true));

db.live("person").diff();

db.kill(q.uuid("2ba318c4-2267-4319-becd-3c60c237f1e2"));
db.kill(q.param("param"));

db.showChanges("TABLE", "foo")
  .since(1)
  .limit(q.add(1, 1));

db.showChanges("DATABASE")
  .since(q.datetime("0000-01-01T00:00:00Z"))
  .limit(q.add(1, 1));
```

API implications:

- Live select is a statement with select-like clauses, not a separate query language.
- `KILL` targets UUID expressions and parameters.
- `SHOW CHANGES` needs typed scope, `SINCE`, and expression-based `LIMIT`.

