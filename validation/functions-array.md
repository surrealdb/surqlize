# Functions: array

Coverage list: `add`, `all`, `any`, `append`, `at`, `boolean_and`, `boolean_not`, `boolean_or`, `boolean_xor`, `clump`, `combine`, `complement`, `concat`, `difference`, `distinct`, `every`, `fill`, `filter`, `filter_index`, `find`, `find_index`, `first`, `flatten`, `fold`, `group`, `includes`, `index_of`, `insert`, `intersect`, `is_empty`, `join`, `last`, `len`, `logical_and`, `logical_or`, `logical_xor`, `map`, `matches`, `max`, `min`, `pop`, `prepend`, `push`, `range`, `reduce`, `remove`, `repeat`, `reverse`, `sequence`, `shuffle`, `slice`, `some`, `sort`, `sort_natural`, `sort_lexical`, `sort_natural_lexical`, `sort::asc`, `sort::desc`, `swap`, `transpose`, `union`, `windows`.

```surql
RETURN array::len([1, 2, 3]);
RETURN [1, 2, 3].map(|$v| $v + 1);
RETURN array::filter([1, 2, 3, 4], |$v| $v > 2);
RETURN array::fold([1, 2, 3], 0, |$acc, $v| $acc + $v);
RETURN array::sort::desc([3, 1, 2]);
RETURN array::windows([1, 2, 3, 4], 2);
```

```ts
fn.array.len([1, 2, 3]);

q.array([1, 2, 3]).fn.map(($v) => $v.add(1));

fn.array.filter([1, 2, 3, 4], ($v) => $v.gt(2));

fn.array.fold([1, 2, 3], 0, ($acc, $v) => $acc.add($v));

fn.array.sort.desc([3, 1, 2]);
fn.array.windows([1, 2, 3, 4], 2);
```

Type-safety target:

- Preserve tuple length for `at`, `first`, `last`, and fixed `windows` where possible.
- Lambda functions should introduce typed `$v`, `$i`, and `$acc` variables as SurrealQL expressions.
- Set-like operations should infer union/intersection element types without requiring casts.

