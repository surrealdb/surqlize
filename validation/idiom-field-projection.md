# Idiom: Fields, Wildcards, Flatten

Source coverage: `idiom/define_field_dot_star*.surql`, `primitive/array/basic.surql`, `reference/docs_*.surql`.

```surql
person.name;
person.tags.*;
person.tags.*.*;
house:one.*;
emails.*.address;
tags.*.value;
```

```ts
q.field("person").field("name");
q.field("person").field("tags").all();
q.field("person").field("tags").all().all();
q.rid("house", "one").all();

db.define.field(q.field("emails").all().address).on("user").type(q.type.option(q.type.number()));
db.define.field(q.field("tags").all().value).on("user").type(q.type.option(q.type.string()));
```

API implications:

- `*` is a path part with different behavior on arrays and objects; it is not just TypeScript spread.
- `field("a.b")` and `field("a").field("b")` need a clear distinction or a parser-backed constructor.
- Schema definitions need idiom builders too, not just query projections.

