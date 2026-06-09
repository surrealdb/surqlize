# Functions: sequence

Coverage list: `nextval`.

```surql
DEFINE SEQUENCE order_id START 100;
RETURN sequence::nextval("order_id");
CREATE order SET id = sequence::nextval("order_id");
```

```ts
db.define.sequence("order_id").start(100);
fn.sequence.nextval("order_id");

db.create("order").set((o) => [
  o.id.assign(fn.sequence.nextval("order_id")),
]);
```

Type-safety target:

- `sequence::nextval` is async/server-side but should embed in `SET`, `RETURN`, and computed expressions before await.

