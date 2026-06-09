# Functions: rand

Coverage list: `rand`, `bool`, `duration`, `enum`, `float`, `id`, `int`, `string`, `time`, `ulid`, `uuid`, `uuid::v4`, `uuid::v7`.

```surql
RETURN rand();
RETURN rand::bool();
RETURN rand::enum("red", "green", "blue");
RETURN rand::int(1, 10);
RETURN rand::string(16);
RETURN rand::uuid::v4();
RETURN rand::uuid::v7(time::now());
```

```ts
fn.rand();
fn.rand.bool();
fn.rand.enum(["red", "green", "blue"] as const);
fn.rand.int(1, 10);
fn.rand.string(16);
fn.rand.uuid.v4();
fn.rand.uuid.v7(fn.time.now());
```

Type-safety target:

- `rand::enum` can infer a string-literal union from const arrays.
- `rand::uuid`, `uuid::v4`, and `uuid::v7` should return `UuidType`, not plain string.

