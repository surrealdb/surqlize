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
