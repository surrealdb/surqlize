/**
 * Create a variable store for parameterized query rendering. Returns a tuple of
 * the variables record and a function to register new variables.
 */
export function createVariableStore() {
	const variables: Record<string, unknown> = {};
	const v = (value: unknown) => {
		const num = Object.keys(variables).length;
		const name = `_v${num}`;
		variables[name] = value;
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
	} satisfies DisplayContext;
}

/** Context used to render queries into parameterized SurrealQL strings. */
export type DisplayContext = {
	var: (value: unknown) => string;
	variables: Record<string, unknown>;
	contextId: symbol;
};
