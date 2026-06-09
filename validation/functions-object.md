# Functions: object

Coverage list: `entries`, `extend`, `remove`, `from_entries`, `is_empty`, `keys`, `len`, `values`.

```surql
RETURN object::keys({ a: 1, b: 2 });
RETURN object::values({ a: 1, b: 2 });
RETURN object::entries({ a: 1, b: 2 });
RETURN object::from_entries([["a", 1], ["b", 2]]);
RETURN object::extend({ a: 1 }, { b: 2 });
RETURN object::remove({ a: 1, b: 2 }, "a");
```

```ts
fn.object.keys({ a: 1, b: 2 });
fn.object.values({ a: 1, b: 2 });
fn.object.entries({ a: 1, b: 2 });
fn.object.fromEntries([["a", 1], ["b", 2]]);
fn.object.extend({ a: 1 }, { b: 2 });
fn.object.remove({ a: 1, b: 2 }, "a");
```

Type-safety target:

- `keys` returns key literals for known object shapes.
- `entries` and `from_entries` should round-trip typed record shapes where possible.
- Builtin names live under `.fn` to avoid collision with object properties named `keys` or `values`.

