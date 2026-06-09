# Functions: math

Coverage list: `abs`, `acos`, `acot`, `asin`, `atan`, `bottom`, `ceil`, `clamp`, `cos`, `cot`, `deg2rad`, `fixed`, `floor`, `interquartile`, `lerp`, `lerpangle`, `ln`, `log`, `log10`, `log2`, `max`, `mean`, `median`, `midhinge`, `min`, `mode`, `nearestrank`, `percentile`, `pow`, `product`, `rad2deg`, `round`, `sign`, `sin`, `spread`, `sqrt`, `stddev`, `sum`, `tan`, `top`, `trimean`, `variance`.

```surql
RETURN math::sum([1, 2, 3]);
RETURN math::mean(score);
RETURN math::clamp(age, 18, 99);
RETURN math::percentile([1, 2, 3, 4], 75);
SELECT country, math::sum(amount) AS total FROM sale GROUP BY country;
```

```ts
fn.math.sum([1, 2, 3]);
fn.math.mean(q.field("score"));
fn.math.clamp(q.field("age"), 18, 99);
fn.math.percentile([1, 2, 3, 4], 75);

db.select("sale")
  .return((s) => ({ country: s.country, total: fn.math.sum(s.amount) }))
  .groupBy("country");
```

Type-safety target:

- Numeric functions should accept number expressions and numeric arrays where SurrealQL does.
- Aggregates must be valid in grouped projections and retain `NumberType`.

