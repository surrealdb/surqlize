# Functions: file

Coverage list: sync pointer helpers `bucket`, `key`; experimental async functions `put`, `put_if_not_exists`, `get`, `head`, `delete`, `copy`, `copy_if_not_exists`, `rename`, `rename_if_not_exists`, `exists`, `list`.

```surql
RETURN file::bucket(f"media:/avatar.png");
RETURN file::key(f"media:/avatar.png");
RETURN file::put(f"media:/avatar.png", <bytes>"data");
RETURN file::get(f"media:/avatar.png").?.to_string();
RETURN file::list("media", { prefix: "/avatars" }).map(|$v| $v.{ file, size });
```

```ts
const avatar = q.file("media", "/avatar.png");

fn.file.bucket(avatar);
fn.file.key(avatar);
fn.file.put(avatar, q.bytes("data"));
fn.file.get(avatar).optional().fn.toString();

fn.file.list("media", { prefix: "/avatars" })
  .fn.map(($v) => $v.pick("file", "size"));
```

Type-safety target:

- File pointers need a distinct literal type.
- File functions are capability-gated upstream; expose this in docs/types.
- `get().?.to_string()` validates optional + method chaining after async functions.

