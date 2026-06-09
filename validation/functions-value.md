# Functions: value

Coverage list: `diff`, `expect`, `patch`; method-only `chain` also appears in method dispatch.

```surql
RETURN value::diff({ a: 1 }, { a: 2 });
RETURN value::patch({ a: 1 }, [{ op: "replace", path: "/a", value: 2 }]);
RETURN value::expect($input, { type: "object" });
RETURN [1, NONE, 3].chain(|$v| $v ?? []);
```

```ts
fn.value.diff({ a: 1 }, { a: 2 });
fn.value.patch({ a: 1 }, [{ op: "replace", path: "/a", value: 2 }]);
fn.value.expect(q.param("input"), { type: "object" });

q.array([1, q.none(), 3]).fn.chain(($v) => $v.coalesce([]));
```

Type-safety target:

- `diff` and `patch` should expose JSON Patch shapes.
- `expect` is a validation expression; allow typed expected schemas without losing the SurrealQL object form.
- `chain` should be available as method syntax only unless SurrealQL adds a namespace function.

