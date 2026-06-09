# SurQLize API Validation

These files are design validation notes, not implementation tests. Each `ts` block is a proposed API shape for discussion against upstream SurrealQL behavior.

Corpus used:

- `../surrealdb/language-tests/tests/language/**/*.surql`
- `../surrealdb/surrealdb/parser/src/test/files/**/*.surql`
- `../surrealdb/surrealdb/core/src/fnc/mod.rs`
- `../surrealdb/surrealdb/core/src/expr/part.rs`

Core API thesis:

- Every statement builder is also an `Expr<T>` until it is awaited or executed.
- Awaiting is the only execution boundary. No special `wrap()` should be needed to embed an unawaited statement in another expression.
- Functions are normal expressions and should be callable through both namespace functions, such as `fn.math.sum(x)`, and method syntax, such as `x.fn.sum()` where SurrealQL supports it.
- Idioms should model SurrealQL path parts directly: field, all, flatten, index expression, range, where, lookup, method, destructure, optional, doc, recursion, and repeat recursion.
- Graph traversal should preserve the `edge -> node` grammar. A call that names an edge should not silently resolve destination nodes.

Proposed naming convention used in examples:

```ts
import { ANY, db, fn, q } from "surqlize";

q.field("name");           // typed idiom/expression factory
q.param("limit");          // $limit
q.rid("person", "one");    // person:one
q.raw("...");              // scoped escape hatch
db.value(raw);             // actionable expression root for raw values
ANY;                       // graph wildcard `?`
out((g) => g("edge"));     // schema-aware graph segment, injected per step
```

Useful validation questions:

- Can the raw SurrealQL be expressed without string concatenation?
- Does the TypeScript type change at the same point as the SurrealQL value changes?
- Can the expression be embedded before awaiting?
- Does the API distinguish clauses from path parts from functions?
- Does every `out` / `in` / `both` call append exactly one arrow segment, with variadic args only expressing alternatives inside that segment?
