# Migrations reference

How Surqlize turns a schema file into the SurrealQL (SQL) that brings a database
in line with it, and every option along the way.

This is a reference for an agent or a developer running migrations. For writing
the schema itself, see [README_SCHEMA.md](README_SCHEMA.md). For the query
builder, see [README.md](README.md).

Everything below was checked against SurrealDB 3.2.

---

## Contents

- [The idea](#the-idea)
- [Quick start](#quick-start)
- [The pipeline](#the-pipeline)
- [CLI reference](#cli-reference)
- [Configuration](#configuration)
- [Programmatic API](#programmatic-api)
- [What the diff produces](#what-the-diff-produces)
- [Renames](#renames)
- [Removing things](#removing-things)
- [History and rollback](#history-and-rollback)
- [Canonicalisation](#canonicalisation)
- [What will not migrate](#what-will-not-migrate)
- [Safety and failure modes](#safety-and-failure-modes)
- [Recipes](#recipes)

---

## The idea

You declare the state you want. Surqlize reads the state the database is in,
compares them, and generates the statements that close the gap. There are no
numbered migration files to write or keep in order.

The correctness property everything is built around is **convergence**:

> Applying a schema, then running `plan` again, must report nothing to do.

If a generated statement is not byte-identical to what SurrealDB stores when it
reads it back, the same change is emitted forever and no migration ever settles.
This is why so much of the code emits defaults SurrealDB would have filled in
anyway, and why `src/migrator/canonical.ts` exists. Convergence is asserted in
`tests/integration/convergence.test.ts`, which is the single most valuable test
in the suite.

---

## Quick start

```zsh
bun sur init                    # writes schema.ts and surqlize.config.ts
# edit schema.ts
bun sur plan                    # see what would change
bun sur migrate                 # apply it
bun sur status                  # what has been applied
bun sur rollback                # undo the most recent migration
```

A real run, against `examples/minimal.ts`:

```
$ bun sur plan --schema examples/minimal.ts
1 change(s):
  table.create task

Statements:
DEFINE TABLE task TYPE NORMAL SCHEMAFULL;
DEFINE FIELD title ON TABLE task TYPE string ASSERT $value != NONE AND string::len($value) >= 1 AND string::len($value) <= 200;
DEFINE FIELD description ON TABLE task TYPE string;
DEFINE FIELD completed ON TABLE task TYPE bool DEFAULT false;
DEFINE FIELD createdAt ON TABLE task TYPE datetime VALUE time::now();

$ bun sur migrate --schema examples/minimal.ts
…
✔ Applied 5 statement(s)

$ bun sur plan --schema examples/minimal.ts
✔ The database matches the schema — nothing to do
```

That last line is convergence.

---

## The pipeline

```
schema.ts
   │  loadDefinitions()      collect every exported table, edge and entity
   ▼
definitions
   │  introspect()           INFO FOR DB, then INFO FOR TABLE per table
   ▼
current schema (statements, verbatim)
   │  diff()                 render each declaration, compare canonically
   ▼
Change[]  →  up[] / down[]
   │  migrate()              run up[], then record it
   ▼
database + a row in _migrations
```

Two design decisions are worth knowing because they explain most of the code:

**Introspection keeps statements, not parsed structures.** `INFO FOR DB` returns
`DEFINE …` statements as strings, and they are held that way. Comparison happens
by canonicalising both sides, so there is nothing to gain from taking them apart
— and a parser would be one more thing to keep in step with SurrealDB's output.

**Comparison is whole-statement, not clause-by-clause.** A change is detected by
canonicalising the declared statement and the stored one and comparing the
results. Nothing tries to work out *which* clause differs; a modified definition
is redefined with `OVERWRITE`.

---

## CLI reference

The binary is `sur`. In this repo, `bun sur <command>`; installed, `npx sur` or
`sur`.

| Command | What it does | Connects? | Loads schema? |
|---|---|---|---|
| `init` | Write `schema.ts` and `surqlize.config.ts` | no | no |
| `plan` (alias `diff`) | Show what would change | yes | yes |
| `migrate` | Apply the schema | yes | yes |
| `status` | List applied migrations | yes | no |
| `rollback` | Undo the most recent migration | yes | no |
| `validate` | Load the schema and report what it declares | no | yes |
| `config` | Show the settings in force | no | no |
| `mermaid` | Draw an ER diagram | no | yes |

`status` and `rollback` do not read the schema file, so they work when it is
broken or absent — which is exactly when you want them.

### Options

| Flag | Short | Applies to | Meaning |
|---|---|---|---|
| `--url <url>` | `-u` | connecting commands | SurrealDB address |
| `--namespace <name>` | `-n` | connecting commands | Namespace |
| `--database <name>` | `-d` | connecting commands | Database |
| `--username <name>` | `-U` | connecting commands | Username |
| `--password <pass>` | `-p` | connecting commands | Password |
| `--schema <path>` | `-s` | schema commands | Path to the schema module |
| `--env <name>` | `-e` | all | Use a named environment from the config file |
| `--remove-missing` | | `plan`, `migrate` | Drop what the schema no longer declares |
| `--yes` | | `migrate`, `rollback` | Do not ask for confirmation |
| `--level <minimal\|detailed>` | | `mermaid` | Detail in the diagram |
| `--output <path>` | `-o` | `mermaid` | Where to write (default `schema-diagram.mermaid`) |
| `--stdout` | | `mermaid` | Print instead of writing |
| `--help` | `-h` | | Show usage |

### Exit codes

| Code | When |
|---|---|
| `0` | Success, including `--help` and “nothing to do” |
| `1` | Any error, an unknown command, no command at all, or a cancelled prompt |

`sur --help` exits 0; `sur` with no command prints the same text and exits 1.

### init

Writes two files, skipping either that already exists (with a warning rather
than an error). Both templates open with a `/**` block comment on purpose:
`.ts` is claimed by both TypeScript and Qt Linguist in shared-mime-info, and
TypeScript is recognised only by magic at offset 0 — `/*`, `//`, `class` or
`function`. Without one of those, a file leading with `import` gets a Linguist
icon in a file manager.

### plan

Prints the changes, then the statements, and applies nothing. It is the dry run;
there is no `--dry-run` flag.

`diff` is an alias, for anyone arriving from **smig**.

### migrate

Prints the statements, applies them, then records the migration.

The prompt appears only when `--remove-missing` is set *and* the plan contains
destructive changes. Dropping things is the only destructive path, so it is the
only one that stops to ask. With no TTY it refuses rather than assuming, and
tells you to pass `--yes`.

### validate

Loads the schema without connecting, and names what it found:

```
✔ schema.ts is valid
  Tables and edges: user, post, authored
  Other definitions: english, fn::slugify
```

Useful in CI, and as a quick check that a file exports what you think.

### config

Reports the settings in force and the environments available. The password is
masked, even when it came from a checked-in file.

```
$ bun sur config --env staging
✔ Environment: staging
  schema     ./schema.ts
  url        wss://staging.example.com
  namespace  app
  database   app
  username   root
  password   ********

  Environments: staging, production
```

Chiefly a way to check that `--env production` resolves to what you think it does
before running anything against it.

---

## Configuration

Four sources. Later wins:

1. Built-in defaults
2. `surqlize.config.ts`
3. The `environments` block named by `--env`
4. `SURREAL_*` environment variables
5. Command-line flags

Environment variables come after the file so a deployment can override a
checked-in config without editing it; flags come last so a one-off run can
override everything.

### Defaults

| Setting | Default |
|---|---|
| `schema` | `./schema.ts` |
| `url` | `ws://localhost:8000` |
| `namespace` | `test` |
| `database` | `test` |
| `username` | `root` |
| `password` | `root` |

### The config file

Tried in order: `surqlize.config.ts`, `.mts`, `.js`, `.mjs`. The first that
exists is used.

```ts
export default {
  schema: "./schema.ts",
  url: "ws://localhost:8000",
  namespace: "app",
  database: "app",
  username: "root",
  password: "root",

  environments: {
    staging: { url: "wss://staging.example.com", database: "app_staging" },
    production: { url: "wss://example.com", database: "app" },
  },
};
```

Every connection setting can be overridden per environment, so one checked-in
file describes local, staging and production without repeating what they share.

`--env <name>` selects one. Naming an environment the file does not define is an
error listing the ones it does (`UnknownEnvironmentError`), rather than silently
falling back to the base settings — which would point a production command at
localhost.

### Environment variables

`SURREAL_SCHEMA`, `SURREAL_URL`, `SURREAL_NAMESPACE`, `SURREAL_DATABASE`,
`SURREAL_USERNAME`, `SURREAL_PASSWORD`.

### Loading the schema file

The schema is imported directly. TypeScript works under Bun, and under Node 22.6+
with `--experimental-strip-types`; on an older runtime, point `schema` at a
compiled `.js` file. This is a plain dynamic import — no bundler, no loader —
which is what lets the package stay dependency-free.

A cache-busting query is appended, so a long-running process sees edits.

Two error messages are worth recognising:

- `No such file: <path>` — the path is wrong.
- `Could not import <path>. Importing TypeScript directly needs Bun, or Node
  22.6+ …` — the runtime cannot read `.ts`. This is raised **only** for
  `Unknown file extension`. A module the schema imports but cannot resolve
  reports its own message instead, which names what is missing.

---

## Programmatic API

Exported from `surqlize/migrate`, kept out of the root entry so importing the ORM
in a browser bundle does not pull in migration machinery.

```ts
import { Surreal } from "surrealdb";
import { applied, diff, introspect, migrate, plan, rollback } from "surqlize/migrate";
import { post, user } from "./schema";

const db = new Surreal();
await db.connect("ws://localhost:8000");
await db.signin({ username: "root", password: "root" });
await db.use({ namespace: "app", database: "app" });

const pending = await plan(db, [user, post]);
if (pending.hasChanges) {
  console.log(pending.up.join("\n"));
  await migrate(db, [user, post]);
}
```

| Function | Signature | Returns |
|---|---|---|
| `plan` | `(session, definitions, options?)` | `MigrationPlan` — a `Diff` plus `hasChanges` |
| `migrate` | `(session, definitions, options?)` | `AppliedMigration \| null` (null when nothing to do) |
| `rollback` | `(session)` | `AppliedMigration \| null` (null when no history) |
| `applied` | `(session)` | `AppliedMigration[]`, oldest first |
| `introspect` | `(session)` | `CurrentSchema` |
| `diff` | `(definitions, current, options?)` | `Diff` — pure, no I/O |
| `canonicalise` | `(statement)` | The comparison form of a statement |
| `equivalent` | `(a, b)` | Whether two statements define the same thing |
| `checksum` | `(statements)` | An 8-character digest |

`DiffOptions` has one member: `removeMissing` (default `false`).

The session is any `SurrealSession` already pointed at a namespace and database —
a `Surreal` instance, or one of its forks.

`diff()` is pure and needs no database, which makes it the easy thing to test
against: hand it a `CurrentSchema` you built by hand.

### Use ESM, not CommonJS

> **Known issue.** Under CommonJS, `require("surqlize")` and
> `require("surqlize/migrate")` load two separate copies of the type classes,
> because `tsup` code-splits the ESM build but not the CJS one. Type detection is
> `instanceof`-based, so every field silently prints as `TYPE any` — a schemafull
> table that accepts anything, with no error and no failure to converge.
>
> ESM is unaffected: both entry points share a chunk, so `import` is correct and
> safe. There is no workaround from CommonJS — the root entry does not export the
> migrator — so until `splitting: true` is added to `tsup.config.ts`, drive
> migrations from ESM or from the `sur` CLI, which is unaffected.

---

## What the diff produces

```ts
interface Diff {
  changes: Change[];
  up: string[];    // every up statement, in order
  down: string[];  // every down statement, in reverse order
}

interface Change {
  kind: string;    // see below
  target: string;  // "user", "user.email", "analyzer english"
  up: string[];
  down: string[];
}
```

Every change carries its own reversal, which is what makes `rollback` possible
without storing a second schema.

### Change kinds

| Kind | Emitted when |
|---|---|
| `table.create` | The table is not in the database |
| `table.modify` | Its `DEFINE TABLE` differs |
| `table.remove` | `removeMissing`, and the schema no longer declares it |
| `field.create` | The field is not in the database |
| `field.modify` | Its `DEFINE FIELD` differs |
| `field.remove` | `removeMissing`, and the schema no longer declares it |
| `field.rename` | `.was()` matched — see below |
| `index.create` / `index.modify` / `index.remove` | As for fields |
| `event.create` / `event.modify` / `event.remove` | As for fields |
| `entity.create` / `entity.modify` / `entity.remove` | Analyzers, params, functions, sequences, accesses, configs |

### Ordering

Database-level definitions come first, then each table: the `DEFINE TABLE`, its
fields, its indexes, its events. This is why an analyzer declared in the same
schema as the index that uses it works without any explicit ordering.

`down` is the whole list reversed, so a rollback unwinds in the opposite order to
the one that built it.

### Modifying, not altering

A changed definition is redefined with `OVERWRITE`, not altered clause by clause:

```surql
DEFINE FIELD OVERWRITE email ON TABLE user TYPE string ASSERT string::is_email($value);
```

SurrealDB does have `ALTER`. `OVERWRITE` is chosen anyway, for two reasons: a
plain `DEFINE FIELD` on an existing field errors with `The field 'x' already
exists`, and expressing a change as a full definition means the statement says
exactly what the field now is — no reasoning about which clauses an `ALTER` left
alone. (`ALTER … RENAME TO`, separately, is a parse error in 3.2; there is no
`RENAME` at all.)

---

## Renames

Declared with `.was()` on the thing being renamed. Taking `examples/minimal.ts`
and renaming `description` to `notes`, while adding an index:

```ts
export const task = table("task", {
  title: t.string(),
  notes: t.string().was("description"),
  completed: t.bool().default(false),
  createdAt: t.date().valueExpr("time::now()"),
}).index("task_done", { fields: ["completed"] });
```

```
$ bun sur plan
2 change(s):
  field.rename task.description -> notes
  index.create task.task_done

Statements:
DEFINE FIELD notes ON TABLE task TYPE string;
UPDATE task SET notes = description;
REMOVE FIELD description ON TABLE task;
UPDATE task UNSET description;
DEFINE INDEX task_done ON TABLE task FIELDS completed;
```

Four statements, because SurrealDB has no `RENAME`. The order matters:
`REMOVE FIELD` must precede the `UNSET`, or a SCHEMAFULL table still enforces the
old field's assertions and rejects it.

**It is idempotent.** A rename is only claimed when the old name is still in the
database *and* the new one is not. Once applied, the same schema produces no
further change, so `.was()` can stay in the file indefinitely.

`.was()` takes several names, for a field renamed more than once:
`.was("handle", "alias")`. The first that still exists in the database wins.

### What supports renaming

| Kind | How | Declared with |
|---|---|---|
| Field | Define new, copy, remove old, unset | `.was(...)` on the type |
| Index | Define under the new name, remove the old | `previousNames` in the options |
| Event | Same | `previousNames` in the options |
| Analyzer, param, function, access | Same | `previousNames` in the options |

Indexes, events and the database-level definitions hold no data of their own, so
a rename is just a redefinition — nothing has to be carried across.

```ts
.index("email_idx", { fields: ["email"], unique: true, previousNames: ["user_email"] })
```

### What does not

| Kind | Why |
|---|---|
| **Table** | Record IDs embed the table name. Every inbound `record<old>` link would dangle, and links held in `record<any>` fields, graph edges or SCHEMALESS tables are invisible to a migration. |
| **Edge** | Same. |
| **Sequence** | The current value is not exposed by `INFO FOR DB`, so recreating one silently restarts the counter. |

Renaming a table is a manual operation. There is no flag that will do it.

---

## Removing things

**Nothing is dropped by default.** A schema is usually a partial view of a
database: it declares the tables an application owns, not everything present.
Dropping whatever it does not mention would destroy data.

`--remove-missing` (or `{ removeMissing: true }`) turns it on. Then:

- Tables the schema does not declare are removed.
- Fields the schema does not declare are removed, except array element fields
  (`items[*]`), which SurrealDB creates itself and which are not drift.
- Indexes and events the schema does not declare, on tables it does, are removed.
- Database-level definitions are removed **only for kinds the schema uses at
  all**. A schema declaring no analyzers will not drop the analyzers a database
  happens to have; a schema declaring one analyzer will drop the others.

The `_migrations` table is excluded from introspection entirely, so it never
appears as drift.

`migrate --remove-missing` prompts before running, unless `--yes` is passed or
there is nothing destructive in the plan. `plan --remove-missing` shows what
would go, and is the right thing to run first.

---

## History and rollback

Applied migrations are recorded in `_migrations`, created SCHEMALESS on demand:

```ts
interface AppliedMigration {
  id: string;
  appliedAt: string;  // ISO 8601
  up: string[];
  down: string[];
  checksum: string;
}
```

```
$ bun sur status
1 migration(s):
  2026-08-12T07:26:44.337Z  5 statement(s)  c93e250b
```

`rollback` takes the most recent migration, runs its `down` statements, and
deletes the record. Run it repeatedly to walk back further.

Before running anything it verifies the checksum — an FNV-1a digest of the `up`
statements. If the record has been edited since it was applied, the `down` no
longer undoes what actually ran, and the rollback stops with a message naming the
migration. FNV-1a is used rather than a hash from `node:crypto` because importing
crypto would make the module unusable in a browser; it is enough to catch an
edited record, and is not a security control.

**A rollback restores shape, not data.** `down` for a dropped table is its
`DEFINE TABLE` statement; the rows are gone. For a renamed field the value is
copied back, because the rename copied it across in the first place.

---

## Canonicalisation

SurrealDB does not return what you gave it. Of 57 statements probed against a
live 3.2 server, **none** came back unchanged. This matters because a comparison
between the declared statement and the stored one is what decides whether
anything needs to change; without normalisation, everything looks modified,
forever.

`canonicalise()` reduces both sides to a comparable form: 13 textual rules plus 4
structural passes. Applied to *both* sides, so a rule can never make two
genuinely different definitions look the same by favouring one form.

The rules, in `src/migrator/canonical.ts`:

| Rewrite | Because |
|---|---|
| `ON TABLE t` → `ON t` | Stored without the keyword |
| Strip `OVERWRITE` | Says how a statement is applied, not what it defines |
| Strip `DEFINE CONFIG` | A config is reported without its keyword |
| Strip backticks around identifiers | SurrealDB quotes reserved words and function namespaces |
| `[*]` → `.*` | Array element fields are defined with brackets, reported with dots |
| Strip `CONCURRENTLY` | Not stored |
| Strip HNSW `LM` | Derived from `M`, printed as a long float |
| `"x"` → `'x'` | Strings are stored single-quoted (only when neither quote is inside) |
| `1.5f` → `1.5` | A non-integer reads back with a float suffix whatever the declared type |
| `;}` → ` }` | A function body loses its final semicolon |
| Collapse whitespace | Carries no meaning between tokens |
| `{  }` → `{}` | An empty block is stored spaced |
| Normalise spacing around commas | `TOKENIZERS BLANK,CLASS` but `FILTERS LOWERCASE, ASCII` |

And structurally:

- **Durations are decomposed.** `1y` is stored as `52w1d`, so every duration is
  converted to nanoseconds and re-expanded. BigInt arithmetic, because a year in
  nanoseconds exceeds `Number.MAX_SAFE_INTEGER`.
- **`COMMENT` and `PERMISSIONS` are lifted out and re-appended** in a fixed
  position, because they may be written in either order but are stored in one.
- **Permission clauses are sorted** into a fixed operation order, with omitted
  operations filled in the way SurrealDB fills them.
- **`option<T>` is rewritten as `none | T`**, at every level of nesting, because
  that is how SurrealDB stores optionality:
  `option<array<option<record<user>>>>` reads back as
  `none | array<none | record<user>>`.

`scripts/surreal-probe.ts` re-runs the whole probe against any server and exits
non-zero when a result stops matching, so it doubles as a regression check on the
database itself. The full account is in
[SURREALDB-FINDINGS.md](SURREALDB-FINDINGS.md).

---

## What will not migrate

Things Surqlize deliberately leaves alone. All of them are silent — no error,
just no change — so they are worth knowing.

| Thing | Behaviour | Why |
|---|---|---|
| `RECORD` access | Created if missing, then never updated | Its signing key reads back as `[REDACTED]`, so it can never compare equal; re-applying would rotate the secret and invalidate every issued token |
| `JWT` access with a `key` | Same | Same |
| `JWT` access with a `url` | Compared and updated normally | A published key set hides nothing |
| `BEARER` access | Compared and updated normally | Nothing about the definition is hidden |
| `DEFINE USER` | Not supported at all | Credentials do not belong in a version-controlled schema |
| `DEFINE MODEL` | Not supported | The uploaded bytes are not recoverable from `INFO` |
| Table renames | Not supported | Record IDs embed the table name |
| Sequence renames | Not supported | The counter would silently restart |
| Table data | Never touched | Except the copy step in a field rename |

To change a `RECORD` access's `SIGNIN` query, remove it and re-add it, or apply
the change by hand.

---

## Safety and failure modes

**`migrate` is not atomic.** The statements run in one `query()` call, which
SurrealDB applies together but does not wrap in a transaction. A failure part-way
leaves the earlier statements applied and records nothing in `_migrations`. This
is the reason `plan` exists and the reason the CLI prints the statements before
running them.

In practice the failure modes worth planning for are:

| Situation | What happens | What to do |
|---|---|---|
| Unreachable server | Fails after 10s with the address it tried | The driver retries a WebSocket forever by default, which is wrong for a command; `sur` makes one attempt with a deadline |
| A statement is rejected | Earlier statements stay applied | Re-run `plan`; it will show only what is still outstanding |
| A full-text or vector index over two columns | Throws before connecting, naming the index | Define one index per column |
| Adding a required field to a table with rows | SurrealDB rejects the existing rows | Add it as `t.option(…)`, backfill, then tighten |
| Narrowing a type against existing data | Rejected | Same approach |
| `_migrations` edited by hand | `rollback` refuses, naming the migration | Fix the record or drop the row |

Convergence is what makes a partial failure recoverable: re-running `plan` always
describes the remaining gap, whatever state the last run left behind.

---

## Recipes

### Check a change without a database

```zsh
bun sur validate                # schema loads, and here is what it declares
```

Or in a test, with no I/O at all:

```ts
import { diff } from "surqlize/migrate";

/** An empty database, as `introspect()` would report one. */
const empty = {
  tables: {},
  entities: {
    analyzer: {}, param: {}, function: {},
    sequence: {}, access: {}, config: {},
  },
};

const changes = diff([user], empty);
expect(changes.up).toContain("DEFINE TABLE user TYPE NORMAL SCHEMAFULL;");
```

### Run against staging

```zsh
bun sur config --env staging    # confirm where it points
bun sur plan   --env staging
bun sur migrate --env staging
```

### Add a required field to a populated table

```ts
// 1. Ship it optional.
status: t.option(t.string()),

// 2. Backfill: UPDATE post SET status = 'draft' WHERE status = NONE;

// 3. Tighten.
status: t.string().default("draft"),
```

### Rename a field

```ts
nickname: t.option(t.string()).was("handle"),
```

Run `plan`, check the four statements, `migrate`. Leave `.was()` in place — it
costs nothing once applied.

### Clean up a database that has drifted

```zsh
bun sur plan --remove-missing        # read this carefully
bun sur migrate --remove-missing     # prompts before dropping
```

### In CI

```zsh
bun sur validate                     # schema is loadable
bun sur plan --env production        # zero changes means the deploy is in sync
```

### Assert convergence in your own tests

The pattern from `tests/integration/convergence.test.ts`, which is worth copying
into any project with a non-trivial schema:

```ts
await migrate(db, definitions);
const second = await plan(db, definitions);
expect(second.hasChanges).toBe(false);
```

It has caught six normalisation bugs and one permissions bug that no unit test
would have found, because every one of them was a statement that was accepted,
stored differently, and re-emitted forever.

---

## Where the code lives

| Path | What |
|---|---|
| `src/migrator/introspect.ts` | `INFO FOR DB` and `INFO FOR TABLE` |
| `src/migrator/canonical.ts` | Normalisation for comparison |
| `src/migrator/diff.ts` | Comparing schema to database |
| `src/migrator/migrate.ts` | `plan`, `migrate`, `rollback`, `applied`, `checksum` |
| `src/cli/index.ts` | Commands, flags, prompts |
| `src/cli/config.ts` | Config file, environments, precedence |
| `src/cli/schema.ts` | Collecting definitions from a schema module |
| `scripts/surreal-probe.ts` | The round-trip probe |
| `tests/integration/convergence.test.ts` | The convergence assertion |
| `tests/unit/migrator/` | Diff and canonicalisation tests |
