# Statement: Block

Source coverage: `statements/block/basic.surql`.

```surql
{ 1; 2; 3 };

{
  LET $x = 5;
  $x + 1
};

{
  LET $a = 5;
  LET $b = 10;
  $a + $b
};

{;};

{
  LET $x = 10;
  RETURN $x + 1
};
```

```ts
q.block([
  1,
  2,
  3,
]);

q.block(($) => [
  $.let("x").eq(5),
  $.param("x").add(1),
]);

q.block(($) => [
  $.let("a").eq(5),
  $.let("b").eq(10),
  $.param("a").add($.param("b")),
]);

q.block([]);

q.block(($) => [
  $.let("x").eq(10),
  q.return($.param("x").add(1)),
]);
```

API implications:

- Blocks are expressions and return the last value unless `RETURN` exits earlier.
- Block-local bindings need scoped parameter helpers.
- Blocks are required for function bodies, event actions, permissions, and control flow.

