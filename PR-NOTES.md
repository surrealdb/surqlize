# Notes for maintainers

Working notes for the schema-DDL and migrations branch. Everything here is
either a decision that would benefit from a second opinion, a change to existing
behaviour, or something found in the existing code along the way.

Not part of the library — delete before merge, or use as the PR body.

---

## Decisions worth a second opinion

### `valueExpr()` rather than `value()`

SurrealQL's `VALUE` clause needs a modifier on `AbstractType`. The natural name
is `value()`, but `LiteralType` already exposes a public `value` accessor
(`src/types/classes.ts`), and TypeScript rejects a subclass property that
conflicts with a base-class method — `LiteralType` would stop compiling.

Two options:

1. Rename `LiteralType.value`, freeing the name. It is used in only two places,
   both inside `classes.ts` itself, and no test touches it.
2. Name the new modifier something else.

Went with **2** (`valueExpr()`), on the grounds that `LiteralType.value` is a
public accessor on an exported class and spending a breaking change on a naming
preference seemed like the wrong trade ahead of 1.0. Happy to switch to option 1
if you would rather have the cleaner `value()` — it is a small change and the
blast radius is genuinely tiny.

### Numeric widths keep `name = "number"`

`int`, `float` and `decimal` are distinct SurrealDB types and a migration has to
know which one to define, but all three report `name = "number"`. Likewise
`set` reports `name = "array"`.

This is deliberate: `getFunctions()` dispatches on `name` at both the type level
and at runtime, so giving them their own names would silently strip the number
and array function families from those fields. The distinction they carry is for
DDL only, and is read via `instanceof` in the type printer.

If you would prefer distinct names, the dispatcher needs an alias map first.

### `decimal` infers `Decimal | number`

`DecimalType` does not convert on parse. Narrowing a `Decimal` to a JS `number`
would defeat the point of the type, so the inferred type admits both — `Decimal`
as SurrealDB returns it, and `number` from a server that widened the value.

---

## Changes to existing behaviour

### The auto-injected `id` is now overridable

`TableSchema.fields` spread the synthesised `id` **last**, so a schema that
declared its own `id` had it silently discarded. It now leads, and a declared
`id` wins:

```ts
const doc = table("doc", {
  id: t.uuid().default("rand::uuid::v7()").readonly(),
  title: t.string(),
});
```

This matters for migrations — a table that generates its own ids needs to say
so — but it is a behaviour change for any schema that was declaring `id` and
relying on it being ignored.

On `EdgeSchema`, `in` and `out` still win over anything declared, since they
define what the edge is.

---

## Bugs found in the existing code

### `TableFields` never excluded `id`

```ts
export type TableFields = Record<Exclude<string, "id">, AbstractType>;
```

`Exclude<string, "id">` is `string`. `Exclude` filters unions of literals; on a
non-union it is a no-op. So the type read as "any field except `id`" but
accepted `id` and every other key.

`EdgeFields` has the same shape with `Exclude<string, "id" | "in" | "out">`.

Fixed for `TableFields` (now plainly `Record<string, AbstractType>`, with `id`
handled explicitly). `EdgeFields` left as-is for now — flagging rather than
touching it, since the fix depends on whether you want declared `in`/`out` to be
a type error or silently overridden.

---

## SurrealDB behaviour worth recording

Found by generating type expressions and running every one against a live
SurrealDB 3.2. Pinned in `tests/integration/print-type.test.ts`.

### There is no `range<T>`

`range<datetime>` is a parse error. SurrealDB ranges carry no element type and
`INFO FOR TABLE` reports a bare `range`. `t.range()` therefore takes no inner
type — it briefly did, which would have been a way to generate invalid DDL.

### `option<T>` is stored as `none | T`

At every level of nesting:

```
declared:  option<array<option<record<user>>>>
stored:    none  | array<none  | record<user>>
```

Anything comparing a declared type against an introspected one has to normalise
this, or a schema looks permanently modified. Relevant to the "Runtime
validation" roadmap item as well as to migrations.

### `FLEXIBLE` comes after the type, not before

```surql
DEFINE FIELD m ON t FLEXIBLE TYPE object;   -- Parse error
DEFINE FIELD m ON t TYPE object FLEXIBLE;   -- correct
```

The error is explicit — "FLEXIBLE must be specified after TYPE" — but only if
you run the statement.

### `id` cannot be defined as `record<tb>`, and cannot be `READONLY`

```
Cannot use the `record<person>` type on the `id` field, as that's not a valid record id key.
Cannot use the `READONLY` keyword on the `id` field.
```

Surqlize injects `id: t.record(tb)` into every schema so a row type has one.
That is a TypeScript convenience and must never reach DDL — the generator skips
it, and only emits an `id` the schema explicitly declares. Everything else is
allowed on `id`: `TYPE string|uuid|int`, `DEFAULT`, `ASSERT`, `COMMENT`.

### Array element fields are created automatically

Defining `items[*].sku` makes SurrealDB create `items[*]` on its own, and every
array gets an element field whether or not children are declared. Emitting
`items[*]` by hand means an extra field on the next diff, so the flattener does
not. Note also that `INFO FOR TABLE` reports these with dot notation
(`items.*.sku`) while `DEFINE` accepts bracket notation.

### Function namespaces come back backticked

```
declared:  DEFAULT rand::uuid::v7()
stored:    DEFAULT `rand`::uuid::v7()
```

Another normalisation the diff layer has to absorb.

### `DEFINE` errors rather than replacing

`DEFINE FIELD a …` on an existing field fails with "The field 'a' already
exists"; the same goes for tables. Changing anything means `DEFINE … OVERWRITE`.

### MTREE indexes are gone

`MTREE DIMENSION 3` is a parse error in every form tried. HNSW is the only
vector index 3.2 offers, so only HNSW is exposed.

### `COUNT` indexes take no columns

`DEFINE INDEX i ON TABLE t FIELDS a COUNT` is rejected; `DEFINE INDEX i ON TABLE
t COUNT` is correct. The index covers the table, not a column.

### `CONCURRENTLY` is accepted but never stored

An index defined with it reads back without it, so comparing it would never
converge. It is stripped before comparison.

### HNSW fills in every tuning parameter

`HNSW DIMENSION 3 DIST COSINE` comes back as `… TYPE F32 EFC 150 M 12 M0 24 LM
0.40242960438184466f`. DIST, TYPE, EFC, M and M0 are emitted explicitly so the
two match. LM is derived from M as a long float and is dropped when comparing —
matching its printed precision is fragile and it carries nothing M does not.

### An access method's key is redacted

`DEFINE ACCESS … TYPE RECORD` gains `WITH JWT ALGORITHM HS512 KEY '[REDACTED]'`
when stored. The stored form can therefore never equal the declared one. An
access method is created when missing and then left alone — re-applying it on
every run would rotate the signing key each time and silently invalidate every
issued token. This is the one definition a migration cannot keep in sync.

### `PERMISSIONS` is expanded to a rule per operation

`PERMISSIONS FOR select FULL` on a table is stored as `FOR select FULL, FOR
create, update, delete NONE`. Both sides are written out in full for comparison,
with the default that applies to the kind: `FULL` for a field, `NONE` for a
table.

### `ON DELETE` does not take the SQL spellings

```
DEFINE FIELD f ON t TYPE record<u> REFERENCE ON DELETE SET NULL;
--< Parse error: Unexpected token `SET`, expected `REJECT`, `CASCASE`, `IGNORE`, `UNSET` or `THEN`
```

The accepted set is `CASCADE`, `IGNORE`, `REJECT`, `UNSET` and `THEN <expr>`.
`SET NULL`, `SET DEFAULT` and `RESTRICT` — the SQL spellings, and the ones smig
offered — are all parse errors. `OnDeleteAction` now matches, with `THEN` typed
as a template literal so an expression can be supplied.

(The error message's `CASCASE` is SurrealDB's own typo, not a transcription
error here.)

### A collection takes a maximum length, and only a maximum

```surql
DEFINE FIELD f ON t TYPE array<string, 10>;      -- valid, stored as written
DEFINE FIELD f ON t TYPE array<string, 1, 10>;   -- Parse error
```

`t.array(inner, max)` and `t.set(inner, max)` take the bound, and it is enforced
by `validate`/`parse` as well as declared. A lower bound has to be an `ASSERT`.
smig emitted two arguments, which SurrealDB rejects.

### `REMOVE FUNCTION` needs the `fn::` prefix

`INFO FOR DB` keys a function by its bare name, but `REMOVE FUNCTION probe;` is
a parse error — the statement needs `fn::probe`. A rename reads the old name
from the introspected keys, so it has to re-qualify it. `DatabaseEntity.remove`
now takes an optional name and each builder qualifies it the way its own
statement needs.

### A dropped field leaves its index behind

`REMOVE FIELD old ON t` succeeds even while an index covers `old`, and the index
survives pointing at a field that no longer exists — silently indexing NONE for
every row, so a `UNIQUE` index stops rejecting duplicates. A field rename
therefore has to be followed by redefining any index over it. Fields are diffed
before indexes, so a declared index is repointed in the same migration; an index
the schema does not declare is not, which is another reason not to leave indexes
out of a schema.

### Six more rewrites, found by sweeping the whole surface at once

Each of these made a schema look permanently modified — the migration reapplied
the same statement on every run. None showed up in a targeted test; all six came
out of one integration test that applies every type, modifier, index kind and
entity and then asks whether anything is left to do.

| Declared | Stored |
|---|---|
| `TOKENIZERS blank, class` | `TOKENIZERS BLANK,CLASS` — uppercased, arguments included: `snowball(english)` reads back `SNOWBALL(ENGLISH)` |
| `FULLTEXT` with no analyzer | `FULLTEXT ANALYZER like` — the built-in is filled in and reported |
| `{ RETURN $n * 2; }` | `{ RETURN $n * 2 }` — the semicolon before a closing brace is dropped |
| `WHEN $event = 'UPDATE' AND (a != b)` | `… AND a != b` — parentheses that are not needed are dropped |
| `DEFAULT 1.5` on a `decimal` | `DEFAULT 1.5f` — any non-integer literal gains the suffix, whatever the field's type |
| `DEFAULT {}` | `DEFAULT {  }` |

Where the stored form is predictable it is now emitted directly (analyzer
casing, the `like` analyzer, event parentheses); where it is not, it is
canonicalised away.

### String literals are quoted to avoid escaping, not consistently

```
declared:  DEFAULT 'it\'s'      stored:  DEFAULT "it's"
declared:  DEFAULT 'say "hi"'   stored:  DEFAULT 'say "hi"'
```

SurrealDB picks whichever quote character the value does not contain rather than
escaping. The generator now does the same.

### Smaller normalisations

- `COMMENT` and `PERMISSIONS` can be written in either order but are stored in
  one
- an event's `THEN` body is stored parenthesised
- redundant parentheses in `ASSERT` are dropped, but needed ones are kept, so
  conditions are only parenthesised when they contain a top-level `OR`
- `TOKENIZERS BLANK,CLASS` is stored unspaced while `FILTERS LOWERCASE, ASCII`
  is spaced
- a sequence reads back as `BATCH 1000 START 0` even when neither was given
- functions are keyed in `INFO FOR DB` by their bare name, not `fn::name`

### Full-text index syntax moved in 3.x

Not hit by this branch, but adjacent and worth knowing if `db.define.index(…)`
from `validation/statement-define-table-field-index.md` ever gets built:

- `SEARCH` is now `FULLTEXT`; `DEFINE INDEX … SEARCH ANALYZER x` is a parse error
- `DOC_IDS_CACHE`, `DOC_LENGTHS_CACHE`, `POSTINGS_CACHE`, `TERMS_CACHE`,
  `POSTINGS_ORDER` and `TERMS_ORDER` are all rejected
- a full-text index accepts exactly one column (`Expected one column, found 2`)
- `BM25` is always reported back as `BM25(1.2,0.75)`, even when not specified
- omitting `ANALYZER` is valid and resolves to the built-in `like` analyzer

---

## Mermaid diagrams

`mermaid(definitions, { level })` renders an ER diagram of a schema, and
`sur mermaid` writes one to a file or stdout. It is pure string generation with
no dependencies and no Node builtins, so it is exported from the root entry and
is safe in a browser bundle.

Two decisions worth noting:

- **Rendering works from a flattened model, not from the schema objects.**
  `toDiagramModel()` reduces tables and edges to plain records, reusing
  `flattenFields()` and `printSurqlType()`. Every rule is then a string rule, so
  there is no second type-walking implementation to keep in step with the DDL
  generator, and each rule is testable without constructing a `TableSchema`.
- **The injected `id` is drawn but never linked.** It is `record<tb>`, so
  inferring a link from it would put a self-reference on every table. `in` and
  `out` are skipped for the same reason — the edge itself is already drawn.

`--level` and `--stdout` are flags rather than an interactive prompt, so the
command runs in CI. It defaults to `minimal`.

### A string default that looks like a call is treated as one

Whether a string `DEFAULT` is SurrealQL or literal text is decided by looking at
it: a value containing parentheses, or starting with `$`, `{` or `[`, is emitted
unquoted. That is right almost always — `time::now()` should be called — but it
means there is no way to store the literal text `time::now()` in a string field.

Pinned in `tests/integration/convergence.test.ts` rather than hidden. If you
would rather have an explicit escape hatch, the obvious shapes are a
`.defaultLiteral(value)` modifier or a `raw()` wrapper for the expression case;
happy to add either.

---

## Naming

### An event's body is `body`, not `then`

`defineEvent({ then })` reads directly off the SurrealQL clause, but an object
with a `then` property is treated as a thenable by `await`, and Biome's
`noThenProperty` rejects it. It is `body`, which also matches
`storedFunction({ body })`.

---

## Type-system notes

### Do not use a polymorphic `this` return type on `AbstractType`

The field modifiers return the concrete subclass, which they must — 
`resolveAccessType` dispatches on `instanceof RecordType`, so a modifier that
downgraded the class would break record-link traversal.

The obvious way to write that is `assert(condition: string): this`. **It does not
work.** A polymorphic `this` in the signature makes `AbstractType` non-assignable
to a subtype-constrained generic, and `Workable<C, R>` inference fails across
`live.ts`, `select.ts` and `orm.ts`.

The working form is a `this` *parameter*:

```ts
assert<S extends AbstractType>(this: S, condition: string): S
```

Same subclass preservation, no variance problem. `TableSchema` and `EdgeSchema`
are not used as generic constraints in that machinery, so they use plain `this`
returns.

### Inference stability is now checked on every run

`tests/smoke/type-check.mts` pins exact inferred shapes, but only after a build.
`tests/unit/schema/inference-stability.test.ts` asserts the same invariant type
equality against `src`, so drift fails on every `bun test` rather than at pack
time.
