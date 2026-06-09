# Functions: vector

Coverage list: `add`, `angle`, `cross`, `dot`, `divide`, `magnitude`, `multiply`, `normalize`, `project`, `scale`, `subtract`, `distance::chebyshev`, `distance::euclidean`, `distance::hamming`, `distance::knn`, `distance::mahalanobis`, `distance::manhattan`, `distance::minkowski`, `similarity::cosine`, `similarity::jaccard`, `similarity::pearson`, `similarity::spearman`.

```surql
RETURN vector::add([1, 2], [3, 4]);
RETURN vector::dot([1, 2, 3], [4, 5, 6]);
RETURN vector::normalize([3, 4]);
RETURN vector::distance::euclidean([1, 2], [3, 4]);
RETURN vector::similarity::cosine([1, 0], [0, 1]);
SELECT id, vector::distance::knn() AS distance FROM item WHERE embedding <|5|> [0.1, 0.2];
```

```ts
fn.vector.add([1, 2], [3, 4]);
fn.vector.dot([1, 2, 3], [4, 5, 6]);
fn.vector.normalize([3, 4]);
fn.vector.distance.euclidean([1, 2], [3, 4]);
fn.vector.similarity.cosine([1, 0], [0, 1]);

db.select("item")
  .return((i) => ({ id: i.id, distance: fn.vector.distance.knn() }))
  .where((i) => i.embedding.knn(5, [0.1, 0.2]));
```

Type-safety target:

- Vector operations accept numeric arrays and usually return numeric arrays or numbers.
- KNN distance depends on planner context; expose the expression but document valid placement.

