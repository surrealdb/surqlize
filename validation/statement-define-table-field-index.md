# Statements: DEFINE TABLE, FIELD, INDEX

Source coverage: `statements/define/table`, `statements/define/field`, `statements/define/index`, parser define files.

```surql
DEFINE TABLE foo SCHEMAFULL DROP;
DEFINE TABLE foo AS SELECT * FROM bar;
DEFINE TABLE foo TYPE RELATION FROM a|b TO c|d ENFORCED;
DEFINE TABLE foo PERMISSIONS FOR select, delete FULL, FOR create NONE, FOR update WHERE 1 == 1;

DEFINE FIELD f ON t FLEXIBLE TYPE { a: int };
DEFINE FIELD f ON t COMPUTED 2 ASSERT 1 == 1;
DEFINE FIELD f ON t REFERENCE ON DELETE CASCADE;
DEFINE FIELD f ON t REFERENCE ON DELETE THEN 1 - 2;

DEFINE INDEX ft_name ON TABLE person COLUMNS name FULLTEXT ANALYZER simple BM25(1.2, 0.75) HIGHLIGHTS;
DEFINE INDEX idx ON t COUNT;
```

```ts
db.define.table("foo").schemafull().drop();
db.define.table("foo").as(db.select("bar").all());

db.define.table("foo")
  .relation({ from: ["a", "b"], to: ["c", "d"], enforced: true });

db.define.table("foo").permissions((p) => [
  p.for(["select", "delete"]).full(),
  p.for("create").none(),
  p.for("update").where(q.eq(1, 1)),
]);

db.define.field("f").on("t").flexible().type(q.type.object({ a: q.type.int() }));
db.define.field("f").on("t").computed(2).assert(q.eq(1, 1));
db.define.field("f").on("t").reference().onDelete("CASCADE");
db.define.field("f").on("t").reference().onDeleteThen(q.sub(1, 2));

db.define.index("ft_name").on("person").columns("name").fulltext("simple").bm25(1.2, 0.75).highlights();
db.define.index("idx").on("t").count();
```

API implications:

- Schema DDL is too broad for stringly helpers only; use fluent builders with an escape hatch for late grammar.
- Field types should be AST type nodes, not raw TypeScript types only.
- Permissions need action-scoped builders because multiple `FOR` clauses can coexist.

