# Idiom: Graph Traversal

Source coverage: `graph/*.surql`, `idiom/graph_filter_flattened.surql`, `primitive/graph/select_inout_graph.surql`.

```surql
person:alice->knows;
person:alice->knows.since;
person:alice->knows->person.name;
person:alice<-knows<-person;
person:alice<->knows<->person;
person:alice->?;
person:alice->?->?;
SELECT ->likes[?true]->person AS likes FROM person;
SELECT ->likes<->person FROM person;
person:alice->(works_on WHERE hours > 20)->project;
SELECT ->(SELECT strength FROM knows ORDER BY strength ASC) AS edges FROM ONLY person:alice;
```

```ts
import { RecordId } from "surrealdb";
import { ANY } from "surqlize";

q.rid("person", "alice").out("knows");
q.rid("person", "alice").out("knows").since;
q.rid("person", "alice").out("knows").out("person").name;

q.rid("person", "alice").in("knows").in("person");
q.rid("person", "alice").both("knows").both("person");
q.rid("person", "alice").out(ANY);
q.rid("person", "alice").out(ANY).out(ANY);
q.rid("person", "alice").out("reports_to", "mentors");

db.value(new RecordId("person", "tobie")).out("authored").out("post");

db.select("person").return((p) => ({
  likes: p.out((g) => g("likes").where(() => q.true())).out("person"),
  related: p.out("likes").both("person"),
  posts: p.out("authored").out("post"),
  any_authored: p.out("authored").out(ANY),
}));

q.rid("person", "alice")
  .out((g) => g("works_on").where((edge) => edge.hours.gt(20)))
  .out("project");

db.select(q.rid("person", "alice"))
  .only()
  .return((p) => ({
    edges: p.out(db.select("knows").return((e) => ({ strength: e.strength })).orderBy("strength", "ASC")),
  }));
```

API implications:

- `out(x)` appends exactly `->x`; `in(x)` appends exactly `<-x`; `both(x)` appends exactly `<->x`.
- Multiple args in a graph call are alternatives at that one segment: `out("reports_to", "mentors")` serializes as `->(reports_to, mentors)`.
- Chained calls are chained arrows: `out("authored").out("post")` serializes as `->authored->post`.
- `ANY` represents `?`; `out(ANY)` and optionally `out()` can serialize as `->?`.
- After `out("edge")` the type is the edge row; after `out("edge").out("node")` the type is the node row.
- Edge filters and node filters occur at different path stages and should type against the current stage; the injected `out((g) => g("edge").where(...))` carries schema-aware filter types for the current step.
- Segment arguments should accept table names, `ANY`, edge record/range expressions, and subqueries.
