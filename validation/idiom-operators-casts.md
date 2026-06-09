# Idiom: Operators and Casts

Source coverage: expression operator tests, primitive truthiness tests, parser examples.

```surql
SELECT VALUE -number FROM thing;
SELECT VALUE !boolean FROM thing;
/foo.*/ = name;
<string> u"00000000-0000-0000-0000-000000000000" = /.*/;
field IN [1, 2, 3];
[5] IN field;
name @@ "Jaime";
title @1@ "animals";
```

```ts
db.select("thing").value((t) => t.number.neg());
db.select("thing").value((t) => t.boolean.not());

q.regex("foo.*").eq(q.field("name"));
q.cast.string(q.uuid("00000000-0000-0000-0000-000000000000")).eq(q.regex(".*"));

q.field("field").inside([1, 2, 3]);
q.value([5]).inside(q.field("field"));

q.field("name").matches("Jaime");
q.field("title").search(1, "animals");
```

API implications:

- Operators should be typed expression nodes, not only methods on current field proxies.
- Casts and regex literals need first-class constructors.
- Full-text operators `@@` and `@n@` should integrate with search functions and index definitions.

