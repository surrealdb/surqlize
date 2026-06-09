# Functions: set

Coverage list: `add`, `all`, `any`, `at`, `complement`, `contains`, `difference`, `filter`, `find`, `first`, `flatten`, `fold`, `intersect`, `is_empty`, `join`, `last`, `len`, `map`, `max`, `min`, `reduce`, `remove`, `slice`, `union`.

```surql
RETURN set::len(<set>[1, 2, 2]);
RETURN set::contains(<set>["a", "b"], "a");
RETURN set::union(<set>[1, 2], <set>[2, 3]);
RETURN <set>[1, 2, 3].map(|$v| $v * 2);
RETURN <set>[1, 2, 3].filter(|$v| $v > 1);
```

```ts
fn.set.len(q.set([1, 2, 2]));
fn.set.contains(q.set(["a", "b"]), "a");
fn.set.union(q.set([1, 2]), q.set([2, 3]));

q.set([1, 2, 3]).fn.map(($v) => $v.mul(2));
q.set([1, 2, 3]).fn.filter(($v) => $v.gt(1));
```

Type-safety target:

- `SetType<T>` should stay distinct from `ArrayType<T>` even when functions overlap.
- Set conversion from arrays should be explicit: `q.set(...)` or `fn.type.set(...)`.

