# Idiom: Reference Lookup

Source coverage: `reference/*.surql`, especially graph comparison and docs tests.

```surql
DEFINE FIELD comics ON person TYPE option<array<record<comic_book>>> REFERENCE;
person:one.comics;
person:one.comics.*.*;
<~person;
cat:one<-likes<-person;
cat:one<~person;
country:canada.{..+collect}.next = country:canada.{..+collect}->next->?;
```

```ts
import { ANY } from "surqlize";

db.define.field("comics")
  .on("person")
  .type(q.type.option(q.type.array(q.type.record("comic_book"))))
  .reference();

q.rid("person", "one").comics;
q.rid("person", "one").comics.all().all();

q.lookup().from("person");
q.rid("cat", "one").in("likes").in("person");
q.rid("cat", "one").lookup().from("person");

q.rid("country", "canada")
  .recurse({ range: [undefined, undefined], collect: true })
  .next
  .eq(
    q.rid("country", "canada")
      .recurse({ range: [undefined, undefined], collect: true })
      .out("next")
      .out(ANY),
  );
```

API implications:

- Reference lookup syntax `<~table` is not just graph traversal, but it overlaps in user intent.
- `REFERENCE` field metadata should inform both forward record-link access and reverse lookup helpers.
- The API should make graph edges and reference fields distinct, while allowing comparison tests to be written naturally.
