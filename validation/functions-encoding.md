# Functions: encoding

Coverage list: `base64::encode`, `base64::decode`, `cbor::encode`, `cbor::decode`, `json::encode`, `json::decode`.

```surql
RETURN encoding::base64::encode("hello");
RETURN encoding::base64::decode("aGVsbG8=");
RETURN encoding::json::encode({ a: 1 });
RETURN encoding::json::decode("{\"a\":1}");
RETURN encoding::cbor::encode({ a: 1 });
```

```ts
fn.encoding.base64.encode("hello");
fn.encoding.base64.decode("aGVsbG8=");
fn.encoding.json.encode({ a: 1 });
fn.encoding.json.decode<{ a: number }>('{"a":1}');
fn.encoding.cbor.encode({ a: 1 });
```

Type-safety target:

- Decoders should default to unknown/object but allow explicit expected output types.
- Encoders accept any `Expr<T>` serializable by SurrealQL.

