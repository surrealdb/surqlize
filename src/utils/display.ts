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

export type DisplayContext = {
	var: (value: unknown) => string;
	variables: Record<string, unknown>;
	contextId: symbol;
};
