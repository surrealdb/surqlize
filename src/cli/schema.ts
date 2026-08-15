import { resolve } from "node:path";
import type { DefinableSchema } from "../schema/ddl/define";
import type { DatabaseEntity } from "../schema/ddl/entities";
import { importModule } from "./config";

/** Anything a migration can act on. */
export type Definition = DefinableSchema | DatabaseEntity;

/**
 * Load the definitions a schema module exports.
 *
 * Every exported value that looks like a table, edge or database-level
 * definition is collected, whether it came from a default export or a named
 * one. That means a schema file can simply export its tables:
 *
 * ```ts
 * export const user = table("user", { ... });
 * export const post = table("post", { ... });
 * ```
 *
 * @param path - Path to the schema module, relative to the working directory
 * @returns Every definition it exports
 */
export async function loadDefinitions(path: string): Promise<Definition[]> {
	const module = await importModule(resolve(process.cwd(), path));
	const found: Definition[] = [];

	for (const value of Object.values(module)) {
		collect(value, found);
	}

	if (!found.length) {
		throw new Error(
			`${path} exports no table, edge or database definitions.\n` +
				"Export them individually, or as a default-exported object.",
		);
	}

	return found;
}

/** Add `value` to `into` if it is a definition, looking inside plain objects. */
function collect(value: unknown, into: Definition[]): void {
	if (isDefinition(value)) {
		// The same table can be exported twice — as a named export and inside a
		// default-exported object — and must not be migrated twice.
		if (!into.includes(value)) into.push(value);
		return;
	}

	// A default export is often an object grouping the definitions together.
	if (value && typeof value === "object" && !Array.isArray(value)) {
		for (const nested of Object.values(value)) collect(nested, into);
		return;
	}

	if (Array.isArray(value)) {
		for (const nested of value) collect(nested, into);
	}
}

/** Whether a value is a table, an edge or a database-level definition. */
function isDefinition(value: unknown): value is Definition {
	if (!value || typeof value !== "object") return false;

	const candidate = value as Record<string, unknown>;
	const isTable = typeof candidate.tb === "string" && "fields" in candidate;
	const isEntity =
		typeof candidate.kind === "string" &&
		typeof candidate.define === "function";

	return isTable || isEntity;
}
