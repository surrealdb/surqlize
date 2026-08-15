// Schema migrations.
//
// Node-only: reads a schema file and talks to a database. Kept out of the root
// entry point so importing the ORM in a browser does not pull it in.

export { canonicalise, equivalent } from "./canonical";
export type { Change, Diff, DiffOptions } from "./diff";
export { diff } from "./diff";
export type { CurrentSchema, CurrentTable } from "./introspect";
export { introspect, MIGRATIONS_TABLE } from "./introspect";
export type { AppliedMigration, MigrationPlan } from "./migrate";
export { applied, checksum, migrate, plan, rollback } from "./migrate";
