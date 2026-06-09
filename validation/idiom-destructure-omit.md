# Idiom: Destructure and Omit

Source coverage: `idiom/destructure-any-expression.surql`, `graph/destructure_*.surql`, select omit tests.

```surql
person:{ name: "Earth" }.{ name };
place:{ name: "Earth" }.{..}.{ id, name, rels: ->?->?.@ };
SELECT obj.{ a, c.{ e, f } } FROM person;
SELECT * OMIT obj.c.{ d, f } FROM person;
SELECT id, name, @.{} FROM person WHERE id = person:alice;
```

```ts
import { ANY } from "surqlize";

q.rid("person", { name: "Earth" }).pick("name");

q.rid("place", { name: "Earth" })
  .recurse({ range: [undefined, undefined] })
  .pick((row) => ({
    id: row.id,
    name: row.name,
    rels: row.out(ANY).out(ANY).repeat(),
  }));

db.select("person").return((p) => ({
  obj: p.obj.pick({ a: true, c: { e: true, f: true } }),
}));

db.select("person").omit((p) => p.obj.c.pick("d", "f"));

db.select("person")
  .return((p) => ({ id: p.id, name: p.name, doc: q.doc().pick() }))
  .where((p) => p.id.eq(q.rid("person", "alice")));
```

API implications:

- Destructure can apply to any expression, including record ids and recursive paths.
- `@.{}` and `@.{..}` are valid document-root idioms; the API needs `q.doc()`.
- `OMIT` should accept idioms, including nested destructure idioms.
