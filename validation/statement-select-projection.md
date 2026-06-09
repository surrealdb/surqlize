# Statement: SELECT Projections

Source coverage: `statements/select/fetch`, `statements/select/group`, `idiom/destructure-any-expression.surql`.

```surql
SELECT * OMIT password FROM person;
SELECT tags.{id, name} FROM person;
SELECT obj.{ a, c.{ e, f } } FROM person;
SELECT * FROM person FETCH tags.*.name;
SELECT *, (SELECT id, name FROM $this.tags) AS tags FROM person;
SELECT tags.{id, name}, array::len(tags) AS tag_count FROM person ORDER BY tag_count DESC;
```

```ts
db.select("person").omit("password");

db.select("person").return((p) => ({
  tags: p.tags.pick("id", "name"),
}));

db.select("person").return((p) => ({
  obj: p.obj.pick({
    a: true,
    c: { e: true, f: true },
  }),
}));

db.select("person").fetch((p) => p.tags.all().name);

db.select("person").return((p) => ({
  ...p.all(),
  tags: db.select(p.$this.tags).return((tag) => ({ id: tag.id, name: tag.name })),
}));

db.select("person")
  .return((p) => ({
    tags: p.tags.pick("id", "name"),
    tag_count: fn.array.len(p.tags),
  }))
  .orderBy("tag_count", "DESC");
```

API implications:

- Projection destructuring is an idiom part, not an object-literal convenience only.
- `FETCH` accepts idioms, parameters, and expressions like `type::field()` / `type::fields()`.
- Subqueries should embed directly without `wrap()`.

