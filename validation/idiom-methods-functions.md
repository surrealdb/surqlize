# Idiom: Method Syntax

Source coverage: `functions/method_syntax.surql`, `functions/general/array_index_method.surql`, method dispatch in `core/src/fnc/mod.rs`.

```surql
[1, 2, 3].len();
[1, 2, 3].map(|$v| $v + 1);
"hello".uppercase();
time::now().year();
{}.keys();
<set>[1, 2, 2].is_empty();
```

```ts
q.array([1, 2, 3]).fn.len();

q.array([1, 2, 3]).fn.map(($v) => $v.add(1));

q.value("hello").fn.uppercase();
fn.time.now().fn.year();
q.object({}).fn.keys();
q.set([1, 2, 2]).fn.isEmpty();
```

API implications:

- Keep method functions under a `.fn` namespace to avoid collisions with field names like `keys`, `values`, `len`, or `id`.
- Method syntax and namespace syntax should share one function registry.
- Closures such as `|$v|` should be typed expression lambdas, not JavaScript callbacks executed locally.

