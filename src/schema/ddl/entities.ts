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
	| "access"
	| "config";

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
	/**
	 * Whether part of this definition is hidden when read back.
	 *
	 * SurrealDB redacts secrets — a signing key comes back as `'[REDACTED]'` —
	 * so a definition carrying one can never equal its stored form. Those are
	 * created when missing and then left alone, because re-applying one on every
	 * run would rotate the secret and invalidate whatever was issued under it.
	 *
	 * It is per definition rather than per kind: a `BEARER` access hides nothing,
	 * and neither does a `JWT` access that verifies against a published key set,
	 * so both of those are kept in sync like anything else.
	 */
	opaque?: boolean;
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
			// SurrealDB uppercases both lists when it stores them, arguments
			// included: `snowball(english)` reads back as `SNOWBALL(ENGLISH)`.
			parts.push(name, "TOKENIZERS", upper(options.tokenizers));
			if (options.filters?.length) {
				parts.push("FILTERS", upper(options.filters));
			}
			if (options.comment) parts.push("COMMENT", quote(options.comment));
			return `${parts.join(" ")};`;
		},
		remove: (key = name) => `REMOVE ANALYZER ${key};`,
	};
}

/** Join a list the way SurrealDB stores it: uppercased, comma-separated. */
function upper(values: string[]): string {
	return values.map((value) => value.toUpperCase()).join(", ");
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

/** How long a grant, a token and a session stay valid. */
export interface AccessDuration {
	/** How long a bearer grant stays valid. `BEARER` only. */
	grant?: string;
	token?: string;
	session?: string;
}

/** Shared by every access type. */
interface AccessCommon {
	duration?: AccessDuration;
	comment?: string;
	previousNames?: string[];
}

/**
 * Record-level access: end users authenticate as rows in a table.
 *
 * This is what lets a browser connect as a user rather than as root.
 */
export interface RecordAccessOptions extends AccessCommon {
	type?: "RECORD";
	/** The query that authenticates an existing user. */
	signin?: string;
	/** The query that creates one. */
	signup?: string;
	/** An extra check run on every authenticated request. */
	authenticate?: string;
}

/** The algorithms SurrealDB will verify a JWT with. */
export type JwtAlgorithm =
	| "HS256"
	| "HS384"
	| "HS512"
	| "RS256"
	| "RS384"
	| "RS512"
	| "ES256"
	| "ES384"
	| "ES512"
	| "PS256"
	| "PS384"
	| "PS512"
	| "EDDSA";

/**
 * Token access: trust JWTs issued somewhere else.
 *
 * Either verify them against a key held here, or point at a published key set
 * and let SurrealDB fetch it. The second form keeps no secret, so unlike the
 * first it can be compared against the database and kept in sync.
 */
export interface JwtAccessOptions extends AccessCommon {
	type: "JWT";
	algorithm?: JwtAlgorithm;
	/** The verification key. Redacted on read-back when it is a shared secret. */
	key?: string;
	/** A signing key, so this instance can issue tokens as well as accept them. */
	issuerKey?: string;
	/** A JWKS endpoint, used instead of `algorithm` and `key`. */
	url?: string;
}

/**
 * Bearer access: long-lived grants, issued and revoked one at a time.
 *
 * Nothing about the definition is hidden on read-back, so it is kept in sync
 * like any other definition. The grants themselves live outside the schema.
 */
export interface BearerAccessOptions extends AccessCommon {
	type: "BEARER";
	/** Whether a grant authenticates a system user or a record. */
	for: "USER" | "RECORD";
}

/** Any of the three access types. */
export type AccessOptions =
	| RecordAccessOptions
	| JwtAccessOptions
	| BearerAccessOptions;

/** What SurrealDB fills in when a duration is not given. */
const BEARER_DURATION = {
	grant: "4w2d",
	token: "1h",
	session: "NONE",
} as const;

/**
 * Define an access method, letting something other than root authenticate.
 *
 * @param name - The access method name, used as `signin({ access: name })`
 * @param options - The type and its settings; `RECORD` when not stated
 *
 * @example
 * ```ts
 * access("user", { signin: "SELECT * FROM user WHERE email = $email" });
 * access("api", { type: "JWT", url: "https://issuer/.well-known/jwks.json" });
 * access("keys", { type: "BEARER", for: "RECORD" });
 * ```
 */
export function access(name: string, options: AccessOptions): DatabaseEntity {
	const type = options.type ?? "RECORD";

	// A shared secret is redacted on read-back; a published key set is not.
	const opaque =
		type === "RECORD" ||
		(type === "JWT" && (options as JwtAccessOptions).url === undefined);

	return {
		kind: "access",
		name,
		key: name,
		previousNames: options.previousNames,
		opaque,
		define: ({ overwrite } = {}) => {
			const parts = ["DEFINE ACCESS"];
			if (overwrite) parts.push("OVERWRITE");
			parts.push(name, "ON DATABASE TYPE", type);

			if (type === "RECORD") parts.push(...recordClauses(options));
			if (type === "JWT")
				parts.push(...jwtClauses(options as JwtAccessOptions));
			if (type === "BEARER") {
				parts.push("FOR", (options as BearerAccessOptions).for);
			}

			const durations = durationClauses(options.duration, type);
			if (durations) parts.push("DURATION", durations);

			if (options.comment) parts.push("COMMENT", quote(options.comment));
			return `${parts.join(" ")};`;
		},
		remove: (key = name) => `REMOVE ACCESS ${key} ON DATABASE;`,
	};
}

/** The `SIGNUP`/`SIGNIN`/`AUTHENTICATE` clauses of a record access. */
function recordClauses(options: AccessOptions): string[] {
	const record = options as RecordAccessOptions;
	const parts: string[] = [];

	for (const [clause, query] of [
		["SIGNUP", record.signup],
		["SIGNIN", record.signin],
		["AUTHENTICATE", record.authenticate],
	] as const) {
		if (query) parts.push(clause, `(${query})`);
	}

	return parts;
}

/** The verification clauses of a token access. */
function jwtClauses(options: JwtAccessOptions): string[] {
	// A key set is fetched rather than held, so it replaces the algorithm.
	if (options.url) return ["URL", quote(options.url)];

	const parts = ["ALGORITHM", options.algorithm ?? "HS512"];
	if (options.key) parts.push("KEY", quote(options.key));
	if (options.issuerKey)
		parts.push("WITH ISSUER KEY", quote(options.issuerKey));

	return parts;
}

/**
 * Render the `DURATION` clause.
 *
 * A `BEARER` access reads back with every duration filled in, so all three are
 * emitted with the values SurrealDB would have supplied — otherwise it would
 * look modified on every run. The other types are opaque and only need to carry
 * what was asked for.
 */
function durationClauses(
	duration: AccessDuration | undefined,
	type: "RECORD" | "JWT" | "BEARER",
): string {
	const parts: string[] = [];

	if (type === "BEARER") {
		parts.push(`FOR GRANT ${duration?.grant ?? BEARER_DURATION.grant}`);
		parts.push(`FOR TOKEN ${duration?.token ?? BEARER_DURATION.token}`);
		parts.push(`FOR SESSION ${duration?.session ?? BEARER_DURATION.session}`);
		return parts.join(", ");
	}

	if (duration?.token) parts.push(`FOR TOKEN ${duration.token}`);
	if (duration?.session) parts.push(`FOR SESSION ${duration.session}`);
	return parts.join(", ");
}

/** Which `INFO FOR DB` key a config is reported under. */
const CONFIG_KEYS = { GRAPHQL: "GraphQL", API: "API" } as const;

/** What a GraphQL config exposes: everything, nothing, or a named list. */
export type GraphqlExposure = "AUTO" | "NONE" | string[];

/** Settings for `DEFINE CONFIG GRAPHQL`. */
export interface GraphqlConfigOptions {
	tables?: GraphqlExposure;
	functions?: GraphqlExposure;
}

/** Settings for `DEFINE CONFIG API`. */
export interface ApiConfigOptions {
	permissions?: string;
}

/**
 * Define a database-level config.
 *
 * `GRAPHQL` controls what the GraphQL endpoint exposes; `API` sets the
 * permissions on custom API routes.
 *
 * Note that a config is stored without its `DEFINE CONFIG` prefix — `INFO FOR
 * DB` reports `GRAPHQL TABLES AUTO FUNCTIONS AUTO` — and is keyed by a name
 * that matches neither the statement nor the reported value (`GraphQL`). Both
 * are handled here rather than left to the caller.
 *
 * @param kind - `GRAPHQL` or `API`
 * @param options - Settings for that kind
 *
 * @example
 * ```ts
 * config("GRAPHQL", { tables: ["user", "post"], functions: "NONE" });
 * ```
 */
export function config(
	kind: "GRAPHQL",
	options?: GraphqlConfigOptions,
): DatabaseEntity;
export function config(kind: "API", options?: ApiConfigOptions): DatabaseEntity;
export function config(
	kind: "GRAPHQL" | "API",
	options: GraphqlConfigOptions & ApiConfigOptions = {},
): DatabaseEntity {
	return {
		kind: "config",
		name: kind,
		key: CONFIG_KEYS[kind],
		define: ({ overwrite } = {}) => {
			const parts = ["DEFINE CONFIG"];
			if (overwrite) parts.push("OVERWRITE");
			parts.push(kind);

			if (kind === "GRAPHQL") {
				parts.push("TABLES", exposure(options.tables));
				parts.push("FUNCTIONS", exposure(options.functions));
			} else if (options.permissions) {
				parts.push("PERMISSIONS", options.permissions);
			}

			return `${parts.join(" ")};`;
		},
		remove: (key = kind) =>
			`REMOVE CONFIG ${key === "GraphQL" ? "GRAPHQL" : key};`,
	};
}

/** `AUTO`, `NONE`, or an explicit list. */
function exposure(value: GraphqlExposure | undefined): string {
	if (value === undefined || value === "AUTO") return "AUTO";
	if (value === "NONE") return "NONE";
	return `INCLUDE ${value.join(", ")}`;
}

/** Quote a string for SurrealQL, escaping any embedded quotes. */
function quote(value: string): string {
	return `'${value.split("'").join("\\'")}'`;
}
