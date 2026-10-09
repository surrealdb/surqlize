import { toPlainModel } from "./model";

/**
 * Create a variable store for parameterized query rendering. Returns a tuple of
 * the variables record and a function to register new variables.
 */
export function createVariableStore() {
	const variables: Record<string, unknown> = {};
	// Names are numbered in registration order. Counting is O(1), where counting
	// the keys on every call made rendering n parameters O(n^2).
	let count = 0;
	const v = (value: unknown) => {
		let name = `_v${count++}`;
		// Only reachable if the caller added entries to the record themselves.
		while (name in variables) name = `_v${count++}`;
		variables[name] = toPlainModel(value);
		return `$${name}`;
	};

	return [variables, v] as const;
}

/**
 * Create a display context for rendering queries as SurrealQL strings. If an
 * upstream context is provided, its variable store is reused to share variables
 * across composed queries.
 */
export function displayContext(upstream?: Partial<DisplayContext>) {
	const [variables, v] =
		upstream?.var && upstream.variables
			? [upstream.variables, upstream.var]
			: createVariableStore();

	return {
		var: v,
		variables,
		contextId: upstream?.contextId ?? Symbol(),
		bareRowsOf: upstream?.bareRowsOf,
	} satisfies DisplayContext;
}

/** Context used to render queries into parameterized SurrealQL strings. */
export type DisplayContext = {
	var: (value: unknown) => string;
	variables: Record<string, unknown>;
	contextId: symbol;
	/**
	 * The context id of a grouped or split SELECT whose own row is referenced
	 * without a `$this` prefix. SurrealDB rejects `$this` in a grouped selection,
	 * so its fields are rendered as bare identifiers instead.
	 */
	bareRowsOf?: symbol;
};
