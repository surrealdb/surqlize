# Functions: duration

Coverage list: `days`, `hours`, `micros`, `millis`, `mins`, `nanos`, `secs`, `weeks`, `years`, `from_days`, `from_hours`, `from_micros`, `from_millis`, `from_mins`, `from_nanos`, `from_secs`, `from_weeks`.

```surql
RETURN duration::days(2w);
RETURN duration::hours(1d);
RETURN duration::from_secs(90);
RETURN duration::from_millis(1500);
UPDATE counter SET ttl += 1h;
```

```ts
fn.duration.days(q.duration("2w"));
fn.duration.hours(q.duration("1d"));
fn.duration.from.secs(90);
fn.duration.from.millis(1500);

db.update("counter").set((c) => [c.ttl.inc(q.duration("1h"))]);
```

Type-safety target:

- Conversion functions should distinguish duration input from numeric input.
- Duration arithmetic operators should share the same expression primitives as numeric arithmetic.

