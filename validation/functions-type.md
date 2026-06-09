# Functions: type

Coverage list: casts `array`, `bool`, `bytes`, `datetime`, `decimal`, `duration`, `file`, `float`, `geometry`, `int`, `number`, `point`, `range`, `record`, `set`, `string`, `string_lossy`, `table`, `uuid`; inspectors `of`, `is_array`, `is_bool`, `is_bytes`, `is_collection`, `is_datetime`, `is_decimal`, `is_duration`, `is_float`, `is_geometry`, `is_int`, `is_line`, `is_none`, `is_null`, `is_multiline`, `is_multipoint`, `is_multipolygon`, `is_number`, `is_object`, `is_point`, `is_polygon`, `is_range`, `is_record`, `is_set`, `is_string`, `is_uuid`; dynamic idioms `field`, `fields`.

```surql
RETURN type::int("42");
RETURN type::record("person:one");
RETURN type::is_record(person:one);
RETURN type::of([1, 2, 3]);
SELECT * FROM person FETCH type::field("author");
SELECT type::fields("id", "name") FROM person;
```

```ts
fn.type.int("42");
fn.type.record("person:one");
fn.type.is.record(q.rid("person", "one"));
fn.type.of([1, 2, 3]);

db.select("person").fetch(fn.type.field("author"));

db.select("person").return((p) => fn.type.fields("id", "name").from(p));
```

Type-safety target:

- Cast functions return concrete `AbstractType` wrappers.
- `type::field(s)` returns idiom expressions, so it must be accepted anywhere an idiom is valid.
- Type predicates should allow narrowing in callbacks where practical.

