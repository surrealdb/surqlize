# Idiom: Record IDs

Source coverage: `idiom/recordid*.surql`, `primitive/record_id/*.surql`, planner compound id tests.

```surql
LET $int = test:123;
LET $str = test:abc;
LET $obj = test:{ val: 456 };
LET $arr = test:[1, 2, 3];
SELECT * FROM test WHERE id.val = 123;
SELECT * FROM test WHERE id.id().val = 123;
SELECT * FROM test WHERE record::id(id).val = 123;
SELECT id FROM t WHERE id[1] = o:1 AND b = 2025;
```

```ts
db.let("int").eq(q.rid("test", 123));
db.let("str").eq(q.rid("test", "abc"));
db.let("obj").eq(q.rid("test", { val: 456 }));
db.let("arr").eq(q.rid("test", [1, 2, 3]));

db.select("test").where((t) => t.id.val.eq(123));

db.select("test").where((t) => t.id.fn.id().val.eq(123));

db.select("test").where((t) => fn.record.id(t.id).val.eq(123));

db.select("t").where((t) => q.and(
  t.id.index(1).eq(q.rid("o", 1)),
  t.b.eq(2025),
));
```

API implications:

- Record IDs are structured values; their id component can be scalar, object, or array.
- `id.id()` and `record::id(id)` need typed return values that expose nested id structure.
- Planner-sensitive idioms like `id[1]` should be representable without raw strings.

