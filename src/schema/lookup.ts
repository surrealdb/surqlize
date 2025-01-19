import { type EdgeFields, EdgeSchema } from "./edge";
import type { TableFields, TableSchema } from "./table";

// Helper to determine if array contains at least one EdgeSchema
type HasEdgeSchema<T extends readonly (EdgeSchema | TableSchema)[]> =
	T extends readonly [
		infer First extends EdgeSchema | TableSchema,
		...infer Rest extends readonly (EdgeSchema | TableSchema)[],
	]
		? First extends EdgeSchema
			? true
			: HasEdgeSchema<Rest>
		: false;

// Helper type to extract schema information
type ExtractSchemaInfo<T> = T extends EdgeSchema<
	infer F,
	infer V,
	infer To,
	EdgeFields
>
	? { type: "edge"; from: F; via: V; to: To }
	: T extends TableSchema<infer Tb, TableFields>
		? { type: "table"; table: Tb }
		: never;

// Helper to get all table names
type ExtractTableNames<Schemas extends readonly (EdgeSchema | TableSchema)[]> =
	ExtractSchemaInfo<Schemas[number]> extends { type: "table"; table: infer Tb }
		? Tb extends string
			? Tb
			: never
		: never;

// Helper to get all unique nodes from schemas
type ExtractNodes<Schemas extends readonly (EdgeSchema | TableSchema)[]> =
	ExtractSchemaInfo<Schemas[number]> extends
		| { type: "edge"; from: infer F; via: infer V; to: infer To }
		| { type: "table"; table: infer Tb }
		? F extends string
			? V extends string
				? To extends string
					? Tb extends string
						? F | V | To | Tb
						: F | V | To
					: never
				: never
			: never
		: never;

// Helper to get connections in "to" direction for a node
type ToConnections<
	Node extends string,
	Schemas extends readonly (EdgeSchema | TableSchema)[],
> = ExtractSchemaInfo<Schemas[number]> extends
	| { type: "edge"; from: infer F; via: infer V; to: infer To }
	| { type: "table"; table: infer Tb }
	? F extends string
		? V extends string
			? To extends string
				? Node extends F
					? readonly [V]
					: Node extends V
						? readonly [To]
						: readonly []
				: readonly []
			: readonly []
		: readonly []
	: readonly [];

// Helper to get connections in "from" direction for a node
type FromConnections<
	Node extends string,
	Schemas extends readonly (EdgeSchema | TableSchema)[],
> = ExtractSchemaInfo<Schemas[number]> extends
	| { type: "edge"; from: infer F; via: infer V; to: infer To }
	| { type: "table"; table: infer Tb }
	? F extends string
		? V extends string
			? To extends string
				? Node extends To
					? readonly [V]
					: Node extends V
						? readonly [F]
						: readonly []
				: readonly []
			: readonly []
		: readonly []
	: readonly [];

// Utility type to make complex types more readable
export type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

// Main lookup type that handles both cases
export type CreateSchemaLookup<
	Schemas extends readonly (EdgeSchema | TableSchema)[],
> = Prettify<
	HasEdgeSchema<Schemas> extends true
		? {
				to: {
					[Node in ExtractNodes<Schemas> & string]: ToConnections<
						Node,
						Schemas
					>;
				};
				from: {
					[Node in ExtractNodes<Schemas> & string]: FromConnections<
						Node,
						Schemas
					>;
				};
			}
		: {
				to: {
					[Node in ExtractTableNames<Schemas>]: readonly [];
				};
				from: {
					[Node in ExtractTableNames<Schemas>]: readonly [];
				};
			}
>;

// Helper function to create the actual lookup object
export function createLookupFromSchemas<
	const Schemas extends readonly (EdgeSchema | TableSchema)[],
>(schemas: Schemas): CreateSchemaLookup<Schemas> {
	const lookup = {
		to: {} as Record<string, readonly string[]>,
		from: {} as Record<string, readonly string[]>,
	};

	// Initialize empty arrays for all nodes
	for (const schema of schemas) {
		if (schema instanceof EdgeSchema) {
			const { from, tb: via, to } = schema;
			for (const node of [from, via, to]) {
				if (!lookup.to[node]) lookup.to[node] = [] as const;
				if (!lookup.from[node]) lookup.from[node] = [] as const;
			}
		} else {
			const { tb } = schema;
			if (!lookup.to[tb]) lookup.to[tb] = [] as const;
			if (!lookup.from[tb]) lookup.from[tb] = [] as const;
		}
	}

	// Build the connections
	for (const schema of schemas) {
		if (schema instanceof EdgeSchema) {
			const { from, tb: via, to } = schema;

			// To direction
			(lookup.to[from] as string[]).push(via);
			(lookup.to[via] as string[]).push(to);

			// From direction
			(lookup.from[to] as string[]).push(via);
			(lookup.from[via] as string[]).push(from);
		}
	}

	return lookup as CreateSchemaLookup<Schemas>;
}
