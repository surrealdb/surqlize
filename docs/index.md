---
layout: home
title: Surqlize — A type-safe TypeScript ORM for SurrealDB
titleTemplate: false
description: A TypeScript-first ORM and auto-migrations library for SurrealDB. Define your models once and get fully typed queries plus the migrations to match.

head:
  - - meta
    - property: og:title
      content: Surqlize — A type-safe TypeScript ORM for SurrealDB
  - - meta
    - property: og:description
      content: A TypeScript-first ORM and auto-migrations library for SurrealDB. Define your models once and get fully typed queries plus the migrations to match.
  # Makes a search result read "Surqlize" above the page title rather than
  # surqlize.com. Google takes the site name from WebSite structured data on the
  # home page only, so this belongs here rather than in the shared head.
  - - script
    - type: application/ld+json
    - |
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Surqlize",
        "alternateName": "Surqlize — TypeScript ORM for SurrealDB",
        "url": "https://surqlize.com/"
      }

hero:
  name: Surqlize
  text: Type-safe SurrealDB, zero migration hassle
  tagline: A SurrealDB ORM for TypeScript that keeps your schema in sync and your queries fully typed, automatically.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started/
    - theme: alt
      text: View on GitHub
      link: https://github.com/surrealdb/surqlize

# Three bands of three. Read across: what it is like to write queries, what it
# is like to change the schema, and why it is safe to adopt. A reader who stops
# after the first row still leaves with a complete thought.
features:
  - icon: 🧠
    title: Types without code generation
    details: Your schema is the source of truth and TypeScript infers the rest. No generated files, no build step, nothing to regenerate when a field moves.
  - icon: 🔍
    title: Queries that can’t go stale
    details: Autocomplete for every table, field and filter. Rename something and the queries that used it stop compiling, instead of failing in production.
  - icon: ⚡
    title: Real-time and graph, fully typed
    details: Live subscriptions and multi-hop traversals keep their types the whole way, so the hardest parts of the API are as safe as the simplest.
  - icon: 🪄
    title: Migrations you never write
    details: Change the schema and Surqlize works out the difference, generating the SurrealQL that brings the database into line with it.
  - icon: 👁️
    title: Nothing is applied unseen
    details: Every statement is shown before it runs. Read the exact SQL, then apply it — or decide not to.
  - icon: ↩️
    title: Reversible by construction
    details: Each migration is stored with the statements that undo it, and a checksum, so an edited history can’t be rolled back blindly.
  - icon: 🧭
    title: One source of truth
    details: The same definition drives your types and your migrations, so your code and your database cannot end up describing different things.
  - icon: 🔌
    title: A library, not a platform
    details: No runtime dependencies, no service to run, no lock-in beyond SurrealDB itself. Something you import, not something you build around.
  - icon: 🛡️
    title: Built for SurrealDB 3
    details: Documents, graphs, vector and full-text search, events and access rules — all first class, and all tested against a real server.
---

<div class="sur-cta">

## Start building with Surqlize today

Define your SurrealDB models in TypeScript and let Surqlize handle migrations and type-safety — so you can ship faster.

<div class="sur-actions">
  <a class="sur-btn is-primary" href="/guide/">Get started</a>
  <a class="sur-btn is-ghost" href="https://github.com/surrealdb/surqlize">View on GitHub</a>
</div>

</div>
