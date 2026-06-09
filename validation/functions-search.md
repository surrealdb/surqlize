# Functions: search

Coverage list: `analyze`, `linear`, `rrf`, `score`, `highlight`, `offsets`.

```surql
RETURN search::analyze("simple", "The quick brown fox");
SELECT id, search::score(1) AS score FROM blog WHERE title @1@ "animals";
SELECT search::highlight("<b>", "</b>", 1) AS title FROM blog WHERE title @1@ "fox";
RETURN search::linear([0.1, 0.2], [0.1, 0.3]);
RETURN search::rrf([1, 2, 3], [3, 2, 1]);
```

```ts
fn.search.analyze("simple", "The quick brown fox");

db.select("blog")
  .return((b) => ({ id: b.id, score: fn.search.score(1) }))
  .where((b) => b.title.search(1, "animals"));

fn.search.highlight("<b>", "</b>", 1);
fn.search.linear([0.1, 0.2], [0.1, 0.3]);
fn.search.rrf([1, 2, 3], [3, 2, 1]);
```

Type-safety target:

- Search scoring functions depend on query execution context; types can expose number/string results but should document context requirements.
- Full-text operators and `DEFINE INDEX ... FULLTEXT` should share typed search references.

