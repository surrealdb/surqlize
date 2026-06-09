# Functions: string

Coverage list: `capitalize`, `concat`, `contains`, `ends_with`, `join`, `len`, `lowercase`, `matches`, `repeat`, `replace`, `reverse`, `slice`, `slug`, `split`, `starts_with`, `trim`, `uppercase`, `words`, `distance::*`, `html::*`, `is_*`, `similarity::*`, `semver::*`.

```surql
RETURN string::uppercase("hello");
RETURN "hello world".split(" ");
RETURN string::distance::levenshtein("kitten", "sitting");
RETURN string::similarity::jaro_winkler("martha", "marhta");
RETURN string::html::sanitize("<b>ok</b>");
RETURN string::is_email("root@example.com");
RETURN string::semver::inc::patch("1.2.3");
RETURN string::semver::set::major("1.2.3", 2);
```

```ts
fn.string.uppercase("hello");
q.value("hello world").fn.split(" ");

fn.string.distance.levenshtein("kitten", "sitting");
fn.string.similarity.jaroWinkler("martha", "marhta");
fn.string.html.sanitize("<b>ok</b>");
fn.string.is.email("root@example.com");
fn.string.semver.inc.patch("1.2.3");
fn.string.semver.set.major("1.2.3", 2);
```

Type-safety target:

- `string::is_*` returns `BoolType`, while `type::is_*` works across all values.
- Nested namespaces should stay nested in TypeScript: `fn.string.semver.inc.patch`.
- Regex arguments should accept typed regex literals, not plain strings only.

