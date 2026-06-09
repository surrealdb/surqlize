# Functions: count, not, sleep, custom

Coverage list: prefixless `count`, `not`, `sleep`; custom `fn::*`; ML `ml::*`; module `mod::*` is covered separately.

```surql
SELECT count() AS total FROM sale GROUP ALL;
RETURN not(true);
RETURN sleep(1s);
DEFINE FUNCTION fn::shout($text: string) { RETURN string::uppercase($text); };
RETURN fn::shout("hello");
```

```ts
db.select("sale").return({ total: fn.count() }).groupAll();
fn.not(true);
fn.sleep("1s");

db.define.function("shout")
  .args({ text: q.type.string() })
  .body((args) => q.return(fn.string.uppercase(args.text)));

fn.custom("shout")("hello");
```

Type-safety target:

- Prefixless builtins should still live in `fn` for discoverability.
- Custom functions need user-defined signatures that compile to `fn::name(...)`.
- `sleep` is async server-side and should remain an expression before await.

