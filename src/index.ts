// Public API surface.
//
// Modules whose every export is intended for consumers are re-exported with a
// wildcard. The `./utils` barrel is the one exception: it also contains internal
// plumbing, so it is re-exported explicitly to keep that plumbing private.

export * from "./error";
// Standalone function families (internal builders kept private in ./internal)
export * from "./functions/standalone";
// Query builders
export * from "./query/api";
export * from "./query/batch";
export * from "./query/create";
export * from "./query/delete";
export * from "./query/insert";
export * from "./query/live";
export * from "./query/relate";
export * from "./query/select";
export * from "./query/transaction";
export * from "./query/update";
export * from "./query/upsert";
// Schema builders (orm, table, edge, fn, api) and their types
export * from "./schema";
// Type system: the `t.*` builders and the `*Type` classes
export * from "./types";
export type {
	DisplayContext,
	IntoWorkable,
	Workable,
	WorkableContext,
} from "./utils";
// Low-level utilities.
//
// The `./utils` barrel additionally exports internal plumbing — `intoWorkable`,
// `isWorkable`, `sanitizeWorkable`, `workableGet`, `createVariableStore` — which
// is deliberately NOT re-exported here. Only the documented escape hatch
// (`displayContext` / `__display`) and the structural types that appear in
// public signatures are part of the surface.
export { __ctx, __display, __type, displayContext } from "./utils";
