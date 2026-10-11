# Proposal: a reactive store with optimistic, offline-capable writes

Status: layers 1 to 4 are implemented, and layer 5 is partly done (merge is
last-writer-wins per top-level field and is not yet pluggable).

## Why

The best idea in modern client data libraries is that a query is a live value:
no manual subscribe, and a mutation shows up immediately. Surqlize already has typed
live queries that survive reconnects. This proposal adds the layer above them,
informed by how `@ascua/surreal` (the Ember addon) handles local edits.

## What `@ascua/surreal` does today

- Each record keeps a `server` and a `client` snapshot. Dirty means
  `diff(client, current)` is non-empty.
- A diff is JSON-Patch-like (`add`, `remove`, `replace`) plus a `change` op
  that carries a diff-match-patch patch for string fields. It sends
  `UPDATE ... PATCH`.
- Sends are debounced (500 ms) and coalesced per record and operation: only
  the last queued write is kept.
- When a server update arrives while edits are in flight, local edits are
  rebased onto the new server state; on the same path the client wins.
- Conflict handling is last-writer-wins per field. There is no version check.
- Nothing is persisted. A failed write rolls the record back, and unsent edits
  are lost on reload. "Offline" means "waiting for the socket".

## Proposed layers, in order

Each layer is useful on its own and none requires the next.

1. **Reactive store (framework-agnostic). Implemented.** `store.query(builder)` returns
   `{ subscribe, getSnapshot }` with `status: loading | success | error`.
   Subscriptions are reference-counted so ten consumers share one
   `LIVE SELECT`, and the first render comes from a snapshot `SELECT`. Thin
   adapters (`surqlize/react`, `/vue`, `/svelte`) wrap it.
2. **Optimistic writes. Implemented.** A write applies to the store immediately and is
   rolled back on failure. This needs echo suppression so the live
   notification for our own write does not flicker the value.
3. **Field-level diff and rebase. Not needed.** Writes are explicit merges of
   top-level fields, so there is nothing to diff. Port the pure parts of ascua: diff, patch,
   and the three-way rebase. Drive them from the table schema rather than
   decorators.
4. **Durable outbox (offline). Implemented.** Persist ordered ops, keyed by record, in
   IndexedDB, and replay on reconnect. This is the part ascua does not have,
   and it is the biggest piece.
5. **Pluggable merge. Not implemented.** Make the merge function swappable. Ship
   last-writer-wins per field, plus text merge for strings. A CRDT can plug in
   here later without touching layers 1 to 4.

## What building layer 1 showed

- A live query with a `WHERE` sends nothing when an update makes a record stop
  matching, so a filtered result goes stale if it follows notifications alone.
  The store therefore subscribes to the whole table and, for any query with a
  filter, order, limit or projection, runs the query again on a change. An
  unfiltered table applies each notification directly.
- A live subscription does not replay changes missed while disconnected, so the
  store reads again on reconnect, and reports `stale` until then.
- `LIVE SELECT` has no `ORDER BY` or `LIMIT`, which the refetch approach avoids.

## Decisions for the next layers

- Writes are explicit calls, not record proxies.
- The view is the server's state with pending writes applied on top.
- A network failure keeps a write in the outbox to retry; a server rejection
  rolls it back and reports the error.
- Merge is last-writer-wins per top-level field. Text merge and CRDTs are out of
  scope for now.

## What building layers 2 and 4 showed

- Pending writes are kept in order in an outbox and shown on top of the
  server's state. A write's answer is put into the base before the write leaves
  the outbox, so the view does not change when the live notification for it
  arrives.
- Writes are sent as `UPSERT ... CONTENT` (create), `UPDATE ... MERGE` and
  `DELETE`, not JSON Patch. This avoids the array-index and `/` or `.` key
  problems of patches, and makes every write safe to send twice.
- A refusal (a server error) removes the write; any other failure keeps it and
  retries. On reconnect the outbox is flushed before queries read again.
- Storage is pluggable: memory by default, IndexedDB on request, with a small
  codec for dates, record ids and similar values.
- A query that is a plain object filter is checked on the client, so a local
  write enters or leaves the result at once. The check answers true, false or
  unknown, and acts only on a definite answer; callback filters, ordered
  results and anything beyond a filter keep the database as the only authority.

## Open questions

1. Is the unit a mutable record proxy (ascua) or explicit `.patch()` calls?
   Explicit calls fit a query builder better and avoid proxies.
2. On failure, roll back or retain and retry? Retain needs the outbox (4).
3. Which is the source of truth when a live notification and an optimistic
   edit disagree? Proposal: server state plus the pending ops replayed on top.
4. Conflict detection: add an optional `updated`/version precondition per
   table, or stay last-writer-wins?
5. SurrealDB patch quirks found in ascua: replacing an array element in place
   can silently no-op, and keys containing `/` or `.` need whole-object
   replacement. The patch writer must work around both.
6. Ordering across records, relations and transactions in the outbox.

## Should we wait for CRDTs?

No. Layers 1 to 4 need no CRDT, and last-writer-wins per field covers most
apps. Because merge is a swappable function (5), a CRDT can be added later
without redoing the rest.
