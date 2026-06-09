# Functions: time

Coverage list: `ceil`, `day`, `floor`, `format`, `group`, `hour`, `max`, `min`, `minute`, `month`, `nano`, `micros`, `millis`, `now`, `round`, `second`, `timezone`, `unix`, `wday`, `week`, `yday`, `year`, `from_nanos`, `from_micros`, `from_millis`, `from_secs`, `from_ulid`, `from_unix`, `from_uuid`, `is_leap_year`, `set_year`, `set_month`, `set_day`, `set_hour`, `set_minute`, `set_second`, `set_nanosecond`.

```surql
RETURN time::now();
RETURN time::year(time::now());
RETURN time::format(time::now(), "%Y-%m-%d");
RETURN time::from_unix(1700000000);
RETURN time::set_month(time::now(), 12);
SELECT time::year(time) AS year FROM temperature;
```

```ts
fn.time.now();
fn.time.year(fn.time.now());
fn.time.format(fn.time.now(), "%Y-%m-%d");
fn.time.from.unix(1700000000);
fn.time.set.month(fn.time.now(), 12);

db.select("temperature").return((t) => ({
  year: fn.time.year(t.time),
}));
```

Type-safety target:

- `time::now` and `time::from_*` return `DateTimeType`.
- Extractors return numbers except `format`/`timezone` and setters return datetimes.
- Method syntax should work on datetime expressions: `t.time.fn.year()`.

