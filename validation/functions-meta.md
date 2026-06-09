# Functions: meta

Coverage list: aliases `meta::id`, `meta::tb`.

```surql
RETURN meta::id(person:one);
RETURN meta::tb(person:one);
```

```ts
fn.meta.id(q.rid("person", "one"));
fn.meta.tb(q.rid("person", "one"));
```

Type-safety target:

- `meta::*` can be generated as aliases to record functions, but keep public names for query fidelity.

