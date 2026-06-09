# Functions: ml and mod

Source coverage: `functions/ml/*.surql`, `functions/module/*.surql`.

```surql
RETURN ml::nonexistent<1.0.0>({ input: 1.0 });
RETURN mod::nonexistent();
```

```ts
fn.ml.model("nonexistent", "1.0.0")({ input: 1.0 });
fn.mod("nonexistent")();
```

Type-safety target:

- `ml::model<version>(...)` has a distinct grammar from normal namespace calls.
- `mod::*` is experimental/capability-gated upstream; keep it behind an explicit API namespace.
- Both should be representable as expressions, even when execution fails due to disabled capabilities.

