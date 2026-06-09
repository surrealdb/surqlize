# Statements: IF, FOR, RETURN, THROW, SLEEP

Source coverage: parser `stmts/if*.surql`, `statements/for`, `return`, `throw`, top-level `SLEEP`, function `sleep`.

```surql
IF true { "yes" };
IF false { "first" } ELSE IF true { "second" } ELSE { "last" };
FOR $i IN 0..3 { SELECT * FROM foo; };
RETURN 1 + 2;
THROW "a string";
SLEEP 1s;
sleep(1s);
```

```ts
q.if(q.true())
  .then("yes");

q.if(q.false())
  .then("first")
  .elseIf(q.true(), "second")
  .else("last");

q.for(q.param("i")).in(q.range(0, 3)).do(($i) => [
  db.select("foo").all(),
]);

q.return(q.add(1, 2));
q.throw("a string");
db.sleep("1s");
fn.sleep("1s");
```

API implications:

- Control-flow constructs are expressions/statements that can appear inside functions, events, transactions, and blocks.
- `FOR` body must accept unawaited statements.
- SurrealQL has both top-level `SLEEP 1s` and function `sleep(1s)` forms; expose both.
