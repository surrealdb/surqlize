# Idiom: Optional Chaining

Source coverage: `idiom/chain_part_optional.surql`, `idiom/optional_passthrough.surql`, primitive file tests.

```surql
{}.prop.is_bool();
{}.prop.?.is_bool();
none.?;
null.?;
1.?;
"a".?;
time::EPOCH.?;
person:aeon.?;
file::get(f"test:/a.txt").?.to_string();
```

```ts
q.object({}).prop("prop").fn.isBool();
q.object({}).prop("prop").optional().fn.isBool();

q.none().optional();
q.null().optional();
q.value(1).optional();
q.value("a").optional();
fn.time.EPOCH.optional();
q.rid("person", "aeon").optional();

fn.file.get(q.file("test", "/a.txt")).optional().fn.toString();
```

API implications:

- Optional is a path part, not TypeScript optional chaining.
- It must work on all value kinds and after function calls.
- Method-style functions after optional chaining need type narrowing to `option<T>`.

