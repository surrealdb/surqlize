# Statement: CREATE

Source coverage: parser `stmts/create.surql`, `statements/create`.

```surql
CREATE a;
CREATE a, b;
CREATE ONLY a, b SET a = 1, b.c += 2, d[1] -= 3, e +?= 4;
CREATE ONLY a, b UNSET a, b.c, d[1];
CREATE ONLY a, b CONTENT { a: 1 };
CREATE ONLY a, b PATCH { a: 1 };
CREATE ONLY a, b MERGE { a: 1 };
CREATE ONLY a, b REPLACE { a: 1 } VERSION 1 TIMEOUT 1;
```

```ts
db.create("a");
db.create(["a", "b"]);

db.create(["a", "b"])
  .only()
  .set((r) => [
    r.a.assign(1),
    r.b.c.inc(2),
    r.d.index(1).dec(3),
    r.e.addIfMissing(4),
  ]);

db.create(["a", "b"]).only().unset((r) => [r.a, r.b.c, r.d.index(1)]);
db.create(["a", "b"]).content({ a: 1 });
db.create(["a", "b"]).patch({ a: 1 });
db.create(["a", "b"]).merge({ a: 1 });
db.create(["a", "b"]).replace({ a: 1 }).version(1).timeout(1);
```

API implications:

- Mutation data clauses should be mutually exclusive and typed: `SET`, `UNSET`, `CONTENT`, `PATCH`, `MERGE`, `REPLACE`.
- Assignment operators need explicit expression nodes: `=`, `+=`, `-=`, `+?=`, and the rest of SurrealQL's operators.
- Multi-target and `ONLY` support belongs on all document mutation statements.

