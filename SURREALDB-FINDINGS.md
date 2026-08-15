# What a migration tool has to work around in SurrealDB 3.2

Notes for the SurrealDB team, gathered while building schema migrations into Surqlize.

Everything here is reproducible, by two scripts. `scripts/surreal-probe.ts` covers what the
database *stores* when you declare something — it runs each case, reads the definition back,
and prints the two side by side. `scripts/surreal-behaviour-probe.ts` covers what the
database *does* when you read and write, which has no stored form to compare and so needs
its own harness:

```
bun scripts/surreal-probe.ts           --endpoint http://localhost:8000
bun scripts/surreal-behaviour-probe.ts --endpoint http://localhost:8000
```

Neither has dependencies — not on Surqlize, not on a test runner, not on the driver — so
either can be dropped into any checkout. Both exit non-zero if a result differs from what
this document records, which makes them regression checks for the behaviour below.

Measured against **SurrealDB 3.2.0** — 57 definition probes and 11 behavioural cases:

> **0 round-trip.** 45 come back changed, 12 are refused. Of the 45, **29 still differ
> after allowing for the two rewrites that apply to everything** — each of those needs its
> own rule in any tool that compares a schema against a database.
>
> Of the 11 behavioural cases, **none errors.** Each returns something well-formed and
> wrong. Those are in section 1b, and they affect anyone using SurrealDB rather than only a
> tool that compares schemas.

---

## The one thing to fix

**`INFO FOR …` does not round-trip.** What it returns is not a set of statements that
would reproduce the schema it describes. It is close enough to look like it should be,
which is worse than if it were plainly a different format.

Every other item in this document is downstream of that. A migration tool has exactly one
question to answer — *does this schema still match this database?* — and the only way to
answer it is to compare what you would write against what `INFO` returns. When those two
are written in different dialects, every difference between them becomes a rule somebody
has to discover, usually in production.

The cost, concretely. Surqlize carries:

- **17 rewrite rules** in `src/migrator/canonical.ts` — thirteen textual substitutions and
  four structural passes — whose only purpose is to make a declared definition and its
  stored form comparable
- **six generators** in `src/schema/ddl/` that emit clauses nobody asked for, purely
  because SurrealDB is going to add them and the two must match: HNSW's five tuning
  parameters, a full-text index's analyzer and BM25 clause, an analyzer's casing, a
  sequence's batch and start, a bearer access's three durations, and the choice of quote
  character on a string default
- two more that deliberately *omit* definitions SurrealDB creates on its own — the
  injected `id`, and the element field of every array
- one flag, `DatabaseEntity.opaque`, for definitions that can never be compared at all

None of that is Surqlize being clever. It is all bookkeeping against the gap between two
representations of the same thing.

### `STRUCTURE` is most of the answer, and is not documented as such

`INFO FOR TABLE t STRUCTURE` and `INFO FOR DB STRUCTURE` already return machine-readable
output:

```
{ kind: 'none | string', name: 'email', assert: 'string::is_email($value)',
  permissions: { create: true, select: true, update: true }, readonly: false }
```

This is the right shape for tooling and removes the need to parse statements. **It should
be the documented path for anything that reads a schema.** Two caveats:

1. **The value-level rewrites are still there.** `kind` is `none | string`, not
   `option<string>`; a decimal default is still the string `'1.5f'`. `STRUCTURE` fixes the
   parsing problem, not the normalisation problem.
2. **Key names differ across all three surfaces.** The GraphQL config is `GRAPHQL` in the
   statement, `GraphQL` in `INFO FOR DB`, and `graphql` in `INFO FOR DB STRUCTURE`.

Surqlize compares statement strings today. If `STRUCTURE` were documented and stable, it
would drop most of `canonical.ts` — that is how much difference this one thing makes.

---

## 1. Silent correctness hazards

These produce wrong behaviour with no error. They are first because they are the ones that
reach production.

### A renamed field leaves its index behind, constraining nothing `[hazard]`

`REMOVE FIELD` succeeds while an index still covers the field. The index survives, naming
something that no longer exists.

```surql
DEFINE FIELD email ON TABLE user TYPE string;
DEFINE INDEX email_uq ON TABLE user FIELDS email UNIQUE;

REMOVE FIELD email ON TABLE user;
DEFINE FIELD email_address ON TABLE user TYPE string;   -- a rename, since there is no RENAME

INFO FOR TABLE user;
-- email_uq: 'DEFINE INDEX email_uq ON user FIELDS email UNIQUE'   ← still there

CREATE user SET email_address = 'a@b.c';
CREATE user SET email_address = 'a@b.c';                -- both accepted
```

The new column is constrained by nothing, silently. Every rename is built out of
`REMOVE FIELD`, so this is reachable by anyone renaming a column.

Worth stating precisely, because the narrower case is **not** silent: with the field
removed and *not* replaced, a schemafull table refuses the write outright —
`Found field 'email', but no such field exists for table 'user'`. It is the rename that
loses the constraint quietly, because the table still accepts writes afterwards.

**Expected:** either refuse the removal while an index depends on the field, or drop the
dependent indexes with it. Either is fine; silence is not.

### An event that can never fire is accepted `[hazard]`

```surql
DEFINE EVENT e ON TABLE t WHEN NULL THEN RETURN 1;   -- accepted
```

`WHEN NULL` is valid and never matches. The event exists, appears in `INFO`, and does
nothing. Anyone assembling a `WHEN` clause programmatically — which is what a schema
library does — can produce this and never know.

**Expected:** reject a `WHEN` that cannot evaluate true, or warn.

### `ALTER … DEFAULT NONE` stores a literal instead of clearing `[hazard]`

```surql
ALTER FIELD f ON TABLE t DEFAULT NONE;   -- accepted
-- stored: DEFINE FIELD f ON t … DEFAULT NONE …
```

It reads as *remove the default*. It sets the default to `NONE`. The clearing form is
`DROP DEFAULT`, which is fine — but the wrong one is accepted silently, and the same is
true of `ASSERT NONE` and `VALUE NONE`.

**Expected:** reject `DEFAULT NONE` in `ALTER`, given `DROP DEFAULT` exists.

### There is no `RENAME` `[hazard]`

```surql
ALTER FIELD old ON TABLE t RENAME TO new;
--< Parse error: Unexpected token `an identifier`, expected Eof
```

So every tool implements renaming as define-new, copy, remove-old, unset-old. That is a
data-movement operation, executed as four separate statements, by a third party. Surqlize
does it and tests it, but it should not be the one deciding what happens if the copy
half-completes.

**Expected:** a `RENAME` that the database performs.

---

## 1b. Reads and writes that mislead

Section 1 is about definitions. These are about using them. None of them errors; each
returns something well-formed and wrong, which is why they are grouped rather than listed
among the grammar papercuts.

All eleven are checked by `bun scripts/surreal-behaviour-probe.ts`.

### A relation row written by anything but `RELATE` is not an edge `[hazard]`

The most serious item in this document.

```surql
CREATE user:a; CREATE user:b; CREATE workspace:w;

RELATE user:a->member_of->workspace:w SET role = 'owner';
UPSERT member_of SET in = user:b, out = workspace:w, role = 'owner' WHERE in = user:b;

SELECT * FROM member_of WHERE in = user:b;
-- [{ id: member_of:4w9…, in: user:b, out: workspace:w, role: 'owner' }]   looks perfect

SELECT ->member_of->workspace AS w FROM user:a;   -- { w: [workspace:w] }
SELECT ->member_of->workspace AS w FROM user:b;   -- { w: [] }
```

The row is written. `SELECT *` returns it with real record links in both endpoints. Graph
traversal cannot see it. `CREATE` behaves the same way, and targeting an explicit edge id
does not help.

Graph traversal reads a vertex-side index that only `RELATE` maintains, so the row exists
as data and not as an edge — and nothing distinguishes the two on inspection.

In a permissions model this is the worst available shape. A membership written this way
exists, reads back correctly in any admin UI and any direct `SELECT`, and is invisible to
every check that traverses: the user is silently denied, and the row you would inspect to
find out why looks entirely fine.

**Expected:** maintain the index on any write that sets `in`/`out` on a relation table, or
refuse the write. Either is fine; silence is not.

### `RELATE` is not idempotent unless the edge id is pinned `[ergonomics]`

```surql
RELATE user:a->member_of->workspace:w SET role = 'owner';          -- twice → two edges
RELATE user:a->member_of:pinned->workspace:w SET role = 'owner';   -- twice → one, updated
```

Reasonable once known, and not discoverable from the documentation. It matters because the
pinned form is the only way to write an idempotent relation, and the obvious alternative —
`UPSERT` — is the hazard above.

`type::record()` cannot supply that id: `RELATE $u->type::record("member_of", $k)->$w` is a
parse error (*"Unexpected token `::`, expected ->"*), so the whole `RecordId` has to be
bound as a parameter.

### A one-hop traversal yields `null` rather than erroring `[hazard]`

```surql
SELECT ->has_contact.email        AS e FROM customer:c;   -- { e: [null] }
SELECT ->has_contact->contact.email AS e FROM customer:c; -- { e: ['p@example.test'] }
```

One hop lands on the *edge record*. Projecting a field the edge does not have yields
`null` — the intuitive spelling is the wrong one, and `null` in a projection reads as
"no data" rather than "you wrote the wrong query".

For a schemafull relation table the mistake is knowable statically.

### `.id` on a record link resolves the link instead of taking the key `[hazard]`

```surql
SELECT VALUE { id: $this.id.id }        FROM person;  -- [{ id: person:slsayh4… }]
SELECT VALUE { id: meta::id($this.id) } FROM person;  -- [{ id: 'slsayh4…' }]
```

`.id` means "take the key" on a `RecordId` in every client SDK and "resolve the link" in
SurrealQL, and both produce something that looks like an identifier. A URL built from the
first is `/customers/customer:abc` rather than `/customers/abc`: wrong, and wrong in a way
that still looks like an id, so it survives review.

### An all-digit key is a different record depending on how it is written `[hazard]`

```surql
CREATE type::record('digits', '123567891235');   -- STRING key
CREATE digits:123567891235;                      -- NUMBER key
SELECT * FROM digits;                            -- two rows
```

Consistent with the type inference, and defensible. It is listed because any system
generating ids from an alphabet containing digits will eventually emit an all-digit one,
and on that single id a record created through a parameterised helper stops being findable
by a literal lookup. A documentation warning would be enough.

### `IN (SELECT id …)` matches nothing, and the statement succeeds `[hazard]`

```surql
SELECT id       FROM acct WHERE email = 'a@b.c';   -- [{ id: acct:u1 }]   objects
SELECT VALUE id FROM acct WHERE email = 'a@b.c';   -- [acct:u1]           record ids

DELETE token WHERE owner IN (SELECT id       FROM acct WHERE email = 'a@b.c');  -- 0 deleted
DELETE token WHERE owner IN (SELECT VALUE id FROM acct WHERE email = 'a@b.c');  -- 1 deleted
```

The two differ by one keyword and only one does anything. A comparison between a record
link and an object is never satisfiable, so warning on it would remove the class.

It is worth calling out for test helpers in particular: a `revokeSessions()` written the
first way revokes nothing, does not error, and the test built on it then asserts that a
revoked session is gone — against a session that was never revoked. The suite passes while
the application is broken.

### A multi-statement query continues past a failing statement `[hazard]`

```surql
DEFINE TABLE batch SCHEMAFULL;
DEFINE FIELD tag ON batch TYPE string;
DEFINE INDEX batch_tag ON batch FIELDS tag UNIQUE;

-- one call, three statements; the second violates the index
CREATE batch SET tag = 'first';
CREATE batch SET tag = 'first';
CREATE batch SET tag = 'third';

SELECT VALUE tag FROM batch;   -- ['first', 'third']
```

Statements before the failure stay applied, and statements *after* it run too.

This is the execution model migrations run on, which is why it appears here rather than as
a footnote: a migration that fails halfway leaves a schema that is neither the old one nor
the new one, and the final state depends on which statements happened to be independent of
the failed one. Wrapping in `BEGIN`/`COMMIT` is the workaround, but transactions cannot
nest — *"Tried to start a transaction while another transaction was open"* — so a caller
cannot defensively wrap something that may already be wrapped.

### A misspelled payload key on `RELATE` is stored silently `[ergonomics]`

```surql
RELATE p:a->follows->p:b SET rle = 'owner';
SELECT * FROM follows;
-- [{ id: follows:tp6…, in: p:a, out: p:b, rle: 'owner' }]
```

Consistent with schemaless behaviour. Listed for its consequence on a relation table: the
reader asks for `role`, gets `NONE`, and denies.

---

## 2. Introspection does not round-trip

The bulk of the work. Each row is a rule Surqlize carries.

Two rewrites apply to **every** field, so they are stated once rather than repeated below:
`ON TABLE t` is stored as `ON t`, and a `PERMISSIONS` clause is appended whether or not one
was written. Everything below is *in addition* to those.

| Declared | Stored | Where Surqlize pays for it |
|---|---|---|
| `TYPE option<string>` | `TYPE none \| string` | `normaliseTypeExpression`, recursive — the rewrite reaches every level of nesting |
| `TYPE decimal DEFAULT 1.5` | `DEFAULT 1.5f` | rule 9 — any non-integer literal gains `f`, whatever the field's declared type |
| `DEFAULT "draft"` | `DEFAULT 'draft'` | rule 7 |
| `DEFAULT 'it\'s'` | `DEFAULT "it's"` | quoting flips to whichever mark the value lacks, so the generator has to predict it |
| `DEFAULT {}` | `DEFAULT {  }` | rule 12 |
| `DEFAULT rand::uuid::v7()` | ``DEFAULT `rand`::uuid::v7()`` | rule 4 — **but `time::now()` and `string::uppercase()` are left alone.** Same syntax, quoted in one namespace and not another |
| `ASSERT ($a) AND ($b)` | `ASSERT $a AND $b` | needed parentheses are kept, redundant ones dropped, so the generator has to know which is which |
| `TYPE "a" \| "b" \| "c"` | `TYPE 'a' \| 'b' \| 'c'` | rule 7 again — a literal union is re-quoted like any other string |
| a `{ }` block written over four lines | collapsed to one | rule 11 — whitespace inside a block body is not preserved |
| `CHANGEFEED 7d` | `CHANGEFEED 1w` | durations are decomposed: `30d`→`4w2d`, `90m`→`1h30m`, `400d`→`1y5w` |
| `FIELDS a CONCURRENTLY` | `FIELDS a` | rule 6 — accepted, then forgotten |
| `FULLTEXT` | `FULLTEXT ANALYZER like BM25(1.2,0.75)` | the generator emits both defaults pre-emptively |
| `HNSW DIMENSION 3 DIST COSINE` | `… TYPE F32 EFC 150 M 12 M0 24 LM 0.40242960438184466f` | five defaults emitted pre-emptively; `LM` is dropped, being a derived float whose printed precision cannot be matched |
| `TOKENIZERS blank, class` | `TOKENIZERS BLANK,CLASS` | uppercased including arguments — `snowball(english)` → `SNOWBALL(ENGLISH)`. Note also `TOKENIZERS` comes back unspaced while `FILTERS` is spaced |
| `DEFINE SEQUENCE s` | `… BATCH 1000 START 0` | emitted pre-emptively |
| `THEN UPDATE t SET x = 1` | `THEN (UPDATE t SET x = 1)` | `unwrapThen` — **but `THEN RETURN 1` is left alone.** The wrapping depends on the statement |
| function `{ RETURN $n * 2; }` | `{ RETURN $n * 2 }` | rule 10 — **but an event block `{ LET $x = 1; RETURN $x; }` keeps its semicolons.** Two nearly identical constructs, opposite treatment |
| `DEFINE CONFIG GRAPHQL …` | `GRAPHQL …` | rule 3 — the keyword that defines it is not in the stored form |
| `items[*].sku` | `items.*.sku` | rule 5 — defined with brackets, reported with dots |
| `DEFINE FIELD OVERWRITE …` | `DEFINE FIELD …` | rule 2 |

### Permissions defaults are inverted between fields and tables `[workaround]`

The same clause means opposite things depending on what it is attached to:

```surql
DEFINE FIELD f ON TABLE t TYPE string PERMISSIONS FOR select WHERE published = true;
-- stored: … FOR select WHERE published = true, FOR create, update FULL

DEFINE TABLE t TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select FULL;
-- stored: … FOR select FULL, FOR create, update, delete NONE
```

An unmentioned operation defaults to **FULL on a field** and **NONE on a table**. Writing
`PERMISSIONS FOR select WHERE …` on a field, expecting to have restricted it, leaves
create and update wide open. That is a security footgun independent of any tooling.

Fields also have three operations, not four — `PERMISSIONS FOR delete` on a field is
`Parse error: Can't define permission DELETE for fields` — which is reasonable but is
another thing a tool learns by trying.

**Expected:** the same default in both places, and it should be the restrictive one.

---

## 3. Information that is not exposed

### A sequence's current value `[workaround]`

`INFO FOR DB` reports a sequence's `start` and `batch`, never where the counter has
reached. A sequence therefore cannot be recreated, and cannot be safely renamed — dropping
and redefining silently restarts it. Surqlize refuses to rename sequences for this reason.

### Secrets, inconsistently `[workaround]`

Redacting is right. The inconsistency is not:

| Definition | Read back |
|---|---|
| `ACCESS … TYPE RECORD` | `KEY '[REDACTED]'` |
| `ACCESS … TYPE JWT ALGORITHM HS512 KEY '…'` | `KEY '[REDACTED]'` |
| `ACCESS … TYPE JWT ALGORITHM RS256 KEY '…'` | public key **in the clear**, issuer key redacted |
| `ACCESS … TYPE JWT URL '…'` | in the clear |
| `ACCESS … TYPE BEARER` | in the clear in `INFO`, redacted inside `STRUCTURE` |
| `USER … PASSWORD '…'` | argon2 `PASSHASH` |

Surqlize has to mark each definition as comparable or not, one at a time
(`DatabaseEntity.opaque`), because there is no rule to derive it from.

**Expected:** the ask is not "stop redacting" — it is a way to tell *changed* from
*unchanged* without seeing the secret. A digest in the read-back form would do it, and
would let a migration keep an access method in sync instead of creating it once and then
never touching it again. Today, changing a signing key means either doing it by hand or
rotating it on every deploy.

### A model's bytes `[workaround]`

`DEFINE MODEL` uploads a file. The bytes are not recoverable from `INFO` and the statement
is not the whole definition, so a model cannot be part of a declarative schema at all.

---

## 4. Grammar papercuts

These fail loudly. They cost an afternoon each rather than an incident, and they are cheap
to fix.

| | |
|---|---|
| `FLEXIBLE TYPE object` | `FLEXIBLE must be specified after TYPE`. The keyword order is the reverse of how it reads |
| `ON DELETE SET NULL` / `RESTRICT` | rejected — the set is `CASCADE`, `IGNORE`, `REJECT`, `UNSET`, `THEN`. The SQL spellings are the obvious first guess |
| the same error message | spells it **`CASCASE`** |
| `array<string, 1, 10>` | rejected; `array<string, 10>` is fine. A maximum is expressible, a minimum is not |
| `FIELDS a, b FULLTEXT` | `Expected one column, found 2` |
| `FIELDS a COUNT` | `Cannot create a count index with fields` — the one index kind that must not have what every other kind requires |
| `ALTER TABLE t DROP` | not in the grammar, though `DROP` is a table option in `DEFINE TABLE` |
| `REMOVE FUNCTION probe` | rejected — needs `fn::probe`, while `INFO FOR DB` keys it as `probe` |
| `DEFINE FIELD id … TYPE record<t>` | rejected, though every row's `id` **is** a record link |
| a parse error | HTTP **400** with the message in the body; a runtime error is HTTP **200** with `status: "ERR"`. Two paths for one concept |

---

## 5. What already works well

Said plainly, because a list of complaints with nothing good in it is easy to dismiss.

- **`DEFINE … OVERWRITE` is exactly right.** Redefining a table preserves its fields,
  indexes, events and rows. It made "declare the desired state and let the tool converge"
  workable, and it is why Surqlize needs no `ALTER` at all.
- **Parse errors name the problem.** `FLEXIBLE must be specified after TYPE` and
  `Can't define permission DELETE for fields` say what is wrong and where. Most databases
  would have said `syntax error`.
- **`INFO FOR DB` covers everything in one call.** Tables, analyzers, functions, params,
  sequences, accesses, configs, users, models — one round trip, no enumeration.
- **`STRUCTURE` exists.** It is most of the fix for the largest problem here, and it is
  already built.
- **3.2 moved in the right direction.** `SEARCH` → `FULLTEXT`, MTREE removed rather than
  left to rot, the cache tuning options dropped. This document is about finishing that.

---

## Appendix: one issue per finding

Each block is self-contained and ready to file. Version is 3.2.0 throughout. Reproduce a
definition finding with `bun scripts/surreal-probe.ts --group <group>`, and a behavioural
one with `bun scripts/surreal-behaviour-probe.ts`.

The behavioural findings come first, because they are the ones that affect anyone using
SurrealDB rather than only a tool that compares schemas.

---

**A relation row written by anything but `RELATE` is not an edge**
`behaviour-probe` · hazard

Repro:
```surql
CREATE user:a; CREATE user:b; CREATE workspace:w;
RELATE user:a->member_of->workspace:w SET role = 'owner';
UPSERT member_of SET in = user:b, out = workspace:w, role = 'owner' WHERE in = user:b;

SELECT * FROM member_of WHERE in = user:b;
-- [{ id: member_of:4w9…, in: user:b, out: workspace:w, role: 'owner' }]
SELECT ->member_of->workspace AS w FROM user:a;   -- { w: [workspace:w] }
SELECT ->member_of->workspace AS w FROM user:b;   -- { w: [] }
```
Expected: an edge, or a refusal.
Actual: a row that reads back perfectly and is invisible to traversal. `CREATE` behaves the
same way; an explicit edge id does not help. In a permissions model the user is silently
denied while the row you would inspect looks correct.

---

**A one-hop traversal onto a relation yields `null` instead of erroring**
`behaviour-probe` · hazard

Repro:
```surql
SELECT ->has_contact.email          AS e FROM customer:c;   -- { e: [null] }
SELECT ->has_contact->contact.email AS e FROM customer:c;   -- { e: ['p@example.test'] }
```
Expected: an error, since the edge has no such field.
Actual: `null`, which reads as "no data" rather than "wrong query". Knowable statically for
a schemafull relation table.

---

**`.id` on a record link resolves the link rather than taking the key**
`behaviour-probe` · hazard

Repro:
```surql
SELECT VALUE { id: $this.id.id }        FROM person;  -- [{ id: person:slsayh4… }]
SELECT VALUE { id: meta::id($this.id) } FROM person;  -- [{ id: 'slsayh4…' }]
```
Expected: the bare key, as `.id` gives on a `RecordId` in the client SDKs.
Actual: the whole record. A URL built from it is `/customers/customer:abc` — wrong, and
still shaped like an id.

---

**`IN (SELECT id …)` matches nothing, and the statement succeeds**
`behaviour-probe` · hazard

Repro:
```surql
SELECT id       FROM acct WHERE email = 'a@b.c';   -- [{ id: acct:u1 }]
SELECT VALUE id FROM acct WHERE email = 'a@b.c';   -- [acct:u1]
DELETE token WHERE owner IN (SELECT id FROM acct WHERE email = 'a@b.c');   -- deletes nothing
```
Expected: a match, or an error.
Actual: zero rows affected and no diagnostic. A comparison between a record link and an
object is never satisfiable, so it could be rejected outright.

---

**A multi-statement query continues past a failing statement**
`behaviour-probe` · hazard

Repro:
```surql
DEFINE TABLE batch SCHEMAFULL;
DEFINE FIELD tag ON batch TYPE string;
DEFINE INDEX batch_tag ON batch FIELDS tag UNIQUE;
CREATE batch SET tag = 'first'; CREATE batch SET tag = 'first'; CREATE batch SET tag = 'third';
SELECT VALUE tag FROM batch;   -- ['first', 'third']
```
Expected: stop at the failure, or roll back.
Actual: the first statement stays applied and the third runs. This is the execution model
migrations use, and transactions cannot nest, so a caller cannot defensively wrap.

---

**An all-digit record key is a different record depending on how it is written**
`behaviour-probe` · hazard

Repro:
```surql
CREATE type::record('digits', '123567891235');   -- STRING key
CREATE digits:123567891235;                      -- NUMBER key
SELECT * FROM digits;                            -- two rows
```
Expected: one record.
Actual: two. Defensible given the type inference, but any id alphabet containing digits
eventually produces one, and on that id a parameterised write stops being findable by a
literal lookup.

---

**`type::record()` is rejected in the middle of a `RELATE`**
`behaviour-probe` · missing feature

Repro:
```surql
RELATE $user->type::record("member_of", $key)->$workspace SET role = $role;
--< Parse error: Unexpected token `::`, expected ->
```
Expected: the documented way to build a record id works where an edge id goes.
Actual: a parse error; the whole `RecordId` has to be bound as a parameter instead. Relevant
because a pinned edge id is the only idempotent form of `RELATE`.

---

**A renamed field leaves its `UNIQUE` index constraining nothing**
`behaviour-probe` · hazard

Repro:
```surql
DEFINE FIELD email ON TABLE user TYPE string;
DEFINE INDEX email_uq ON TABLE user FIELDS email UNIQUE;
REMOVE FIELD email ON TABLE user;
DEFINE FIELD email_address ON TABLE user TYPE string;
CREATE user SET email_address = 'a@b.c';
CREATE user SET email_address = 'a@b.c';   -- both accepted
```
Expected: the index follows the rename, or the rename is refused.
Actual: the index survives naming `email`, and the new column is unconstrained. Note the
narrower case is *not* silent: with the field removed and not replaced, a schemafull table
refuses the write with `Found field 'email', but no such field exists`.

---

**`REMOVE FIELD` leaves dependent indexes in place, silently disabling them**
`probe --group hazards` · hazard

Repro (`bun scripts/surreal-probe.ts --group hazards`):
```surql
DEFINE TABLE user SCHEMAFULL;
DEFINE FIELD email ON TABLE user TYPE string;
DEFINE INDEX email_uq ON TABLE user FIELDS email UNIQUE;
REMOVE FIELD email ON TABLE user;
INFO FOR TABLE user;
-- indexes: { email_uq: 'DEFINE INDEX email_uq ON user FIELDS email UNIQUE' }
```
Expected: the removal is refused, or `email_uq` goes with it.
Actual: `email_uq` remains, indexing a field that no longer exists. A `UNIQUE` index that
no longer rejects duplicates is a correctness failure with no diagnostic.

---

**`WHEN NULL` events are accepted and never fire**
`probe --group events` · hazard

Repro:
```surql
DEFINE EVENT e ON TABLE t WHEN NULL THEN CREATE audit SET at = time::now();
```
Expected: rejected, or warned about.
Actual: accepted. The event exists and never runs.

---

**`ALTER … DEFAULT NONE` sets a default rather than clearing one**
`probe --group hazards` · hazard

Repro:
```surql
DEFINE FIELD f ON TABLE t TYPE option<int> DEFAULT 5;
ALTER FIELD f ON TABLE t DEFAULT NONE;
-- stored: DEFINE FIELD f ON t TYPE none | int DEFAULT NONE PERMISSIONS FULL

ALTER FIELD f ON TABLE t DROP DEFAULT;
-- stored: DEFINE FIELD f ON t TYPE none | int PERMISSIONS FULL
```
Expected: rejected, since `DROP DEFAULT` is the clearing form and does work.
Actual: accepted, storing a literal `NONE` default. `ASSERT NONE` and `VALUE NONE` behave
the same way.

---

**No `RENAME` for fields**
`probe --group grammar` · missing feature

Expected: `ALTER FIELD old ON TABLE t RENAME TO new`, performed by the database.
Actual: a parse error, so every tool reimplements it as define / copy / remove / unset and
owns the failure modes of a data migration it should not be running.

---

**`INFO FOR …` output is not re-executable**
`probe` (all groups) · design

Expected: feeding `INFO` output back reproduces the schema.
Actual: 0 of 57 probes round-trip; 29 differ in ways needing a dedicated rule. Full table
in section 2 above.

Suggested: document `INFO … STRUCTURE` as the supported interface for tooling, align its
key names with the statement keywords, and state the normalisations that remain inside it.

---

**Permission defaults are inverted between fields and tables**
`probe --group clauses` · security

Repro:
```surql
DEFINE FIELD f ON TABLE t TYPE string PERMISSIONS FOR select WHERE published = true;
INFO FOR TABLE t;
```
Expected: unmentioned operations are restricted.
Actual: `FOR create, update FULL`. The same clause on a table defaults the rest to `NONE`.
Someone restricting a field's read access silently leaves writes open.

---

**Function namespaces are backticked inconsistently**
`probe --group defaults` · normalisation

Repro:
```surql
DEFINE FIELD a ON TABLE t TYPE uuid     DEFAULT rand::uuid::v7();
DEFINE FIELD b ON TABLE t TYPE datetime DEFAULT time::now();
INFO FOR TABLE t;
```
Expected: both treated alike.
Actual: `` `rand`::uuid::v7() `` and `time::now()`.

---

**Event bodies and function bodies normalise differently**
`probe --group events` · normalisation

Repro:
```surql
DEFINE FUNCTION fn::f() { RETURN 1; };
DEFINE EVENT e ON TABLE t WHEN $event = "CREATE" THEN { LET $x = 1; RETURN $x; };
DEFINE EVENT u ON TABLE t WHEN $event = "CREATE" THEN UPDATE t SET x = 1;
```
Expected: consistent treatment of a block body.
Actual: the function body loses its trailing semicolon; the event block keeps its
semicolons; a bare `UPDATE` body gains parentheses while a bare `RETURN` does not.

---

**Durations are silently rewritten**
`probe --group tables` · normalisation

Repro: `DEFINE TABLE t TYPE NORMAL SCHEMAFULL CHANGEFEED 7d;`
Expected: `CHANGEFEED 7d`.
Actual: `CHANGEFEED 1w`. Also `30d`→`4w2d`, `90m`→`1h30m`, `400d`→`1y5w`.

---

**`DEFINE CONFIG` is stored without its keyword, under a third spelling**
`probe --group entities` · normalisation

Repro: `DEFINE CONFIG GRAPHQL TABLES AUTO FUNCTIONS AUTO;` then `INFO FOR DB;`
Expected: the stored form is the statement.
Actual: `GRAPHQL TABLES AUTO FUNCTIONS AUTO`, keyed `GraphQL` — and `graphql` in
`INFO FOR DB STRUCTURE`. Three spellings of one name.

---

**Secret redaction is inconsistent across access types**
`probe --group entities` · design

Expected: a consistent rule, and a way to compare without the secret.
Actual: see the table in section 3. A tool cannot derive which definitions are comparable.

---

**Error message misspells `CASCADE`**
`probe --group grammar` · trivial

Actual: ``expected `REJECT`, `CASCASE`, `IGNORE`, `UNSET` or `THEN` ``.

---

**A count index rejects `FIELDS`; a full-text index rejects more than one**
`probe --group indexes` · ergonomics

Both are defensible individually. Together with HNSW's silent defaults they mean the index
grammar has four sets of rules for one statement, discoverable only by trying.
