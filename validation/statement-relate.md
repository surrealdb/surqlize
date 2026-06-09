# Statement: RELATE

Source coverage: parser `stmts/relate.surql`, `statements/relate`, `graph/edge_direct_queries.surql`.

```surql
RELATE person:one->knows->person:two;
RELATE person:two<-knows<-person:one;
RELATE person:one->knows:best->person:two;
RELATE person:one->$edge->person:two;
RELATE ONLY c<-$param<-a MERGE { a: b } RETURN BEFORE TIMEOUT 1s;
```

```ts
db.relate({
  from: q.rid("person", "one"),
  edge: "knows",
  to: q.rid("person", "two"),
});

db.relate({
  from: q.rid("person", "one"),
  edge: q.rid("knows", "best"),
  to: q.rid("person", "two"),
});

db.relate.reverse({
  from: q.rid("person", "two"),
  edge: q.param("edge"),
  to: q.rid("person", "one"),
});

db.relate({ from: q.rid("a"), edge: q.param("param"), to: q.rid("c") })
  .only()
  .merge({ a: q.field("b") })
  .return("BEFORE")
  .timeout("1s");
```

API implications:

- `RELATE` should expose direction and edge record identity explicitly.
- Relation table typing can validate `from` and `to`, but cannot erase the edge record.
- Graph traversal expressions and `RELATE` statements should share relation metadata.

