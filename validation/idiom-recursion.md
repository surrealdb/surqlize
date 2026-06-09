# Idiom: Recursion

Source coverage: `idiom/recursion_*.surql`, `graph/path_*.surql`, `reference/graph_comparison_recursive.surql`.

```surql
a:1.{1}.links;
a:1.{0..}.link;
a:1.{..256}.link;
person:alice.{..+collect}->reports_to->person;
person:alice.{2..+collect+inclusive}->reports_to->person;
person:alice.{..+path}->reports_to->person;
person:alice.{..+shortest=person:ceo+inclusive}->reports_to->person;
planet:earth.{2+path}(.contains).name;
SELECT name, @{2}(->knows->person).name AS names_2nds FROM person;
SELECT VALUE @{..}.{ name, knows: ->knows->person.@ } FROM person;
```

```ts
q.rid("a", 1).recurse({ depth: 1 }).links;
q.rid("a", 1).recurse({ range: [0, undefined] }).link;
q.rid("a", 1).recurse({ range: [undefined, 256] }).link;

q.rid("person", "alice")
  .recurse({ range: [undefined, undefined], collect: true })
  .out("reports_to")
  .out("person");

q.rid("person", "alice")
  .recurse({ range: [2, undefined], collect: true, inclusive: true })
  .out("reports_to")
  .out("person");

q.rid("person", "alice")
  .recurse({ range: [undefined, undefined], path: true })
  .out("reports_to")
  .out("person");

q.rid("person", "alice")
  .recurse({ shortest: q.rid("person", "ceo"), inclusive: true })
  .out("reports_to")
  .out("person");

q.rid("planet", "earth").recurse({ depth: 2, path: true, via: q.field("contains") }).name;

db.select("person").return((p) => ({
  name: p.name,
  names_2nds: q.repeat({ depth: 2 }, p.out("knows").out("person")).name,
}));
```

API implications:

- Recursion has depth/range plus optional instruction: `collect`, `path`, or `shortest`, each with `inclusive`.
- Recursion can apply to graph traversal or record-link idioms like `(.contains)`.
- Repeat recursion `@` needs a first-class API because it is not the same as recursive depth on the current path.
