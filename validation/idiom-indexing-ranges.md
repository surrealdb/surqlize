# Idiom: Indexes, Ranges, Filters

Source coverage: `idiom/array_range.surql`, `idiom/index_call.surql`, `idiom/index_expression.surql`, select tests.

```surql
[3, 2, 1].*[0..1].min();
[[3, 2, 1], [1, 2, 3]].*[0..1].min();
RETURN [1, 2, 3, 4][fn::foo()];
SELECT tags[WHERE type = "library"][0].value FROM documentation:test;
SELECT languages[$lang] AS content FROM documentation:test;
SELECT languages[primarylang] AS content FROM documentation;
```

```ts
q.array([3, 2, 1]).all().range(0, 1).fn.min();

q.array([[3, 2, 1], [1, 2, 3]])
  .all()
  .range(0, 1)
  .fn.min();

q.return(q.array([1, 2, 3, 4]).index(fn.custom("foo")()));

db.select(q.rid("documentation", "test")).return((d) => ({
  value: d.tags.where((tag) => tag.type.eq("library")).index(0).value,
}));

db.select(q.rid("documentation", "test")).return((d) => ({
  content: d.languages.index(q.param("lang")),
}));

db.select("documentation").return((d) => ({
  content: d.languages.index(d.primarylang),
}));
```

API implications:

- Index parts accept expressions, not only numbers and strings.
- `[WHERE ...]` is an idiom filter, separate from statement `WHERE`.
- Ranges should preserve inclusivity and unbounded ends.

