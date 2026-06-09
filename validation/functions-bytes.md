# Functions: bytes

Coverage list: `len`.

```surql
RETURN bytes::len(<bytes>"hello");
RETURN <bytes>"hello".len();
```

```ts
fn.bytes.len(q.bytes("hello"));
q.bytes("hello").fn.len();
```

Type-safety target:

- Bytes literals should be distinct from strings.
- Method syntax should only expose byte-safe functions plus shared `type::is_*` and casts.

