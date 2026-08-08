/**
 * Database-level definitions: things that belong to the database rather than to
 * a table.
 *
 * Each renders to a `DEFINE …` statement and knows how to remove itself, which
 * is all the diff needs — they are compared by name and by definition, exactly
 * as tables are.
 */

/** What kind of thing a database-level definition is. */
export type EntityKind =
	| "analyzer"
	| "param"
	| "function"
	| "sequence"
	| "access";

/** A definition that belongs to the database rather than a table. */
export interface DatabaseEntity {
	kind: EntityKind;
	name: string;
	/**
	 * The key `INFO FOR DB` reports this under.
	 *
	 * Usually the name, but a function is keyed by its bare name while its
	 * statement uses the `fn::` prefix.
	 */
	key: string;
	/** Previous names, so a rename redefines rather than dropping and recreating. */
	previousNames?: string[];
	/** Render the `DEFINE` statement. */
	define(options?: { overwrite?: boolean }): string;
	/**
	 * Render the statement that removes it.
	 *
	 * `key` names a different entity of the same kind to remove — the old name
	 * during a rename. Each builder qualifies it the way its own statement needs,
	 * which matters for a function: `INFO FOR DB` keys it bare but
	 * `REMOVE FUNCTION` needs the `fn::` prefix.
	 */
	remove(key?: string): string;
}

/** How text is split into tokens and then filtered, for full-text search. */
export interface AnalyzerOptions {
	tokenizers: string[];
	filters?: string[];
	comment?: string;
	previousNames?: string[];
}

/**
 * Define an analyzer, which turns text into the terms a full-text index stores.
 *
 * @param name - The analyzer name, referenced by `index(…, { fulltext })`
 * @param options - Tokenizers and filters
 */
export function analyzer(
	name: string,
	options: AnalyzerOptions,
): DatabaseEntity {
	return {
		kind: "analyzer",
		name,
		key: name,
		previousNames: options.previousNames,
		define: ({ overwrite } = {}) => {
			const parts = ["DEFINE ANALYZER"];
			if (overwrite) parts.push("OVERWRITE");
			parts.push(name, "TOKENIZERS", options.tokenizers.join(", "));
			if (options.filters?.length) {
				parts.push("FILTERS", options.filters.join(", "));
			}
			if (options.comment) parts.push("COMMENT", quote(options.comment));
			return `${parts.join(" ")};`;
		},
		remove: (key = name) => `REMOVE ANALYZER ${key};`,
	};
}

/** A value available to every query in the database. */
export interface ParamOptions {
	/** The value, as a SurrealQL expression. */
	value: string;
	comment?: string;
	previousNames?: string[];
}

/**
 * Define a database parameter, referenced in queries as `$name`.
 *
 * @param name - The parameter name, without the leading `$`
 * @param options - Its value
 */
export function param(name: string, options: ParamOptions): DatabaseEntity {
	const bare = name.replace(/^\$/, "");

	return {
		kind: "param",
		name: bare,
		key: bare,
		previousNames: options.previousNames,
		define: ({ overwrite } = {}) => {
			const parts = ["DEFINE PARAM"];
			if (overwrite) parts.push("OVERWRITE");
			parts.push(`$${bare}`, "VALUE", options.value);
			if (options.comment) parts.push("COMMENT", quote(options.comment));
			return `${parts.join(" ")};`;
		},
		remove: (key = bare) => `REMOVE PARAM $${key.replace(/^\$/, "")};`,
	};
}

/** A stored function. */
export interface FunctionOptions {
	/** Arguments, as `[name, surqlType]` pairs. */
	args?: [string, string][];
	/** The return type, as a SurrealQL type. */
	returns?: string;
	/** The body, without the surrounding braces. */
	body: string;
	permissions?: string;
	comment?: string;
	previousNames?: string[];
}

/**
 * Define a stored function.
 *
 * @param name - The function name, with or without the `fn::` prefix
 * @param options - Its arguments, return type and body
 */
export function storedFunction(
	name: string,
	options: FunctionOptions,
): DatabaseEntity {
	const full = name.startsWith("fn::") ? name : `fn::${name}`;

	return {
		kind: "function",
		name: full,
		// INFO FOR DB keys functions by their bare name
		key: full.replace(/^fn::/, ""),
		previousNames: options.previousNames,
		define: ({ overwrite } = {}) => {
			const args = (options.args ?? [])
				.map(([argName, type]) => `$${argName.replace(/^\$/, "")}: ${type}`)
				.join(", ");

			const parts = ["DEFINE FUNCTION"];
			if (overwrite) parts.push("OVERWRITE");
			parts.push(`${full}(${args})`);
			if (options.returns) parts.push("->", options.returns);
			parts.push(`{ ${options.body.trim()} }`);
			if (options.permissions) parts.push("PERMISSIONS", options.permissions);
			if (options.comment) parts.push("COMMENT", quote(options.comment));
			return `${parts.join(" ")};`;
		},
		remove: (key = full) =>
			`REMOVE FUNCTION ${key.startsWith("fn::") ? key : `fn::${key}`};`,
	};
}

/** A monotonically increasing counter. */
export interface SequenceOptions {
	/** The first value handed out. */
	start?: number;
	/** How many values are reserved at a time. */
	batch?: number;
	previousNames?: string[];
}

/**
 * Define a sequence.
 *
 * `BATCH` and `START` are always emitted because SurrealDB fills them in — a
 * bare `DEFINE SEQUENCE s` reads back as `BATCH 1000 START 0`, so omitting them
 * would leave the sequence looking permanently modified.
 *
 * Note that a sequence's current value is not exposed by `INFO FOR DB`. Dropping
 * and recreating one silently restarts it, which is why renaming a sequence is
 * not supported.
 *
 * @param name - The sequence name
 * @param options - Its starting value and batch size
 */
export function sequence(
	name: string,
	options: SequenceOptions = {},
): DatabaseEntity {
	return {
		kind: "sequence",
		name,
		key: name,
		define: ({ overwrite } = {}) => {
			const parts = ["DEFINE SEQUENCE"];
			if (overwrite) parts.push("OVERWRITE");
			parts.push(
				name,
				"BATCH",
				String(options.batch ?? 1000),
				"START",
				String(options.start ?? 0),
			);
			return `${parts.join(" ")};`;
		},
		remove: (key = name) => `REMOVE SEQUENCE ${key};`,
	};
}

/** How long a token and a session stay valid. */
export interface AccessDuration {
	token?: string;
	session?: string;
}

/** A record-level authentication method. */
export interface AccessOptions {
	/** The query that authenticates an existing user. */
	signin?: string;
	/** The query that creates one. */
	signup?: string;
	/** An extra check run on every authenticated request. */
	authenticate?: string;
	duration?: AccessDuration;
	comment?: string;
	previousNames?: string[];
}

/**
 * Define a record-level access method, letting end users authenticate directly.
 *
 * This is what lets a browser connect to SurrealDB as a user rather than as
 * root.
 *
 * SurrealDB generates a signing key and reports it as `'[REDACTED]'`, so the
 * stored definition can never be compared against the declared one in full. A
 * declared access method is created when missing and otherwise left alone — a
 * change to it has to be applied deliberately.
 *
 * @param name - The access method name, used as `signin({ access: name })`
 * @param options - The signin and signup queries, and how long sessions last
 */
export function access(name: string, options: AccessOptions): DatabaseEntity {
	return {
		kind: "access",
		name,
		key: name,
		previousNames: options.previousNames,
		define: ({ overwrite } = {}) => {
			const parts = ["DEFINE ACCESS"];
			if (overwrite) parts.push("OVERWRITE");
			parts.push(name, "ON DATABASE TYPE RECORD");

			for (const [clause, query] of [
				["SIGNUP", options.signup],
				["SIGNIN", options.signin],
				["AUTHENTICATE", options.authenticate],
			] as const) {
				if (query) parts.push(clause, `(${query})`);
			}

			const durations = durationClauses(options.duration);
			if (durations) parts.push("DURATION", durations);

			if (options.comment) parts.push("COMMENT", quote(options.comment));
			return `${parts.join(" ")};`;
		},
		remove: (key = name) => `REMOVE ACCESS ${key} ON DATABASE;`,
	};
}

/** Render the `DURATION` clause, or an empty string when nothing is set. */
function durationClauses(duration: AccessDuration | undefined): string {
	const parts: string[] = [];
	if (duration?.token) parts.push(`FOR TOKEN ${duration.token}`);
	if (duration?.session) parts.push(`FOR SESSION ${duration.session}`);
	return parts.join(", ");
}

/** Quote a string for SurrealQL, escaping any embedded quotes. */
function quote(value: string): string {
	return `'${value.split("'").join("\\'")}'`;
}
