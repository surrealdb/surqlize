/** How SurrealDB measures distance between vectors. */
export type DistanceMetric =
	| "COSINE"
	| "EUCLIDEAN"
	| "MANHATTAN"
	| "MINKOWSKI"
	| "CHEBYSHEV"
	| "HAMMING";

/** The numeric width an HNSW index stores vectors at. */
export type VectorType = "F64" | "F32" | "I64" | "I32" | "I16";

/** Full-text search options. */
export interface FulltextOptions {
	/** The analyzer that tokenises the column. Omitted means the built-in `like`. */
	analyzer?: string;
	/** BM25 relevance scoring, optionally tuned. */
	bm25?: boolean | { k1: number; b: number };
	/** Record term positions so matches can be highlighted. */
	highlights?: boolean;
}

/**
 * HNSW vector index options.
 *
 * SurrealDB fills in every tuning parameter it was not given, so they are
 * emitted explicitly — otherwise the stored definition would never match the
 * declared one and the index would look permanently modified.
 */
export interface HnswOptions {
	dimension: number;
	dist?: DistanceMetric;
	type?: VectorType;
	/** Size of the candidate list used while building. */
	efc?: number;
	/** Connections per node. */
	m?: number;
	/** Connections per node in the base layer. Defaults to twice `m`. */
	m0?: number;
}

/** What an index covers and how. */
export interface IndexOptions {
	/** The columns to index. Omitted only for a `COUNT` index. */
	fields?: string[];
	/** Reject duplicate values. */
	unique?: boolean;
	/** Make this a full-text index. Exactly one column is allowed. */
	fulltext?: boolean | FulltextOptions;
	/** Make this an HNSW vector index. */
	hnsw?: HnswOptions;
	/** Index the table's row count rather than a column. */
	count?: boolean;
	/**
	 * Build without blocking writes.
	 *
	 * Accepted but not stored — SurrealDB treats it as a directive about how to
	 * apply the statement, not part of what the index is, so it never appears in
	 * a diff.
	 */
	concurrently?: boolean;
	comment?: string;
	/** Previous names, so a rename redefines rather than dropping and recreating. */
	previousNames?: string[];
}

/** An index attached to a table. */
export interface IndexDefinition extends IndexOptions {
	name: string;
}

/** SurrealDB's defaults, emitted so a declared index matches the stored one. */
const HNSW_DEFAULTS = {
	dist: "EUCLIDEAN",
	type: "F32",
	efc: 150,
	m: 12,
} as const;

/**
 * Render a `DEFINE INDEX` statement.
 *
 * @param tableName - The table the index belongs to
 * @param index - What to index and how
 * @param options - Whether to replace an existing definition
 * @returns A complete `DEFINE INDEX` statement
 */
export function defineIndex(
	tableName: string,
	index: IndexDefinition,
	options: { overwrite?: boolean } = {},
): string {
	requireSingleColumn(index);

	const parts = ["DEFINE INDEX"];
	if (options.overwrite) parts.push("OVERWRITE");
	parts.push(index.name, "ON TABLE", tableName);

	// A COUNT index covers the table itself, so it takes no columns.
	if (!index.count && index.fields?.length) {
		parts.push("FIELDS", index.fields.join(", "));
	}

	if (index.count) parts.push("COUNT");
	else if (index.hnsw) parts.push(...hnswClause(index.hnsw));
	else if (index.fulltext) parts.push(...fulltextClause(index.fulltext));
	else if (index.unique) parts.push("UNIQUE");

	if (index.concurrently) parts.push("CONCURRENTLY");
	if (index.comment)
		parts.push("COMMENT", `'${index.comment.replace(/'/g, "\\'")}'`);

	return `${parts.join(" ")};`;
}

/**
 * Reject a full-text or vector index over more than one column.
 *
 * SurrealDB fails these with `Expected one column, found 2`, but only once the
 * statement reaches the server — by which point earlier statements in the
 * migration have already been applied. Failing here says which index is wrong.
 */
function requireSingleColumn(index: IndexDefinition): void {
	const kind = index.fulltext ? "full-text" : index.hnsw ? "HNSW" : null;
	if (!kind) return;

	const count = index.fields?.length ?? 0;
	if (count <= 1) return;

	throw new Error(
		`Index '${index.name}' is ${kind} over ${count} columns. ` +
			"SurrealDB accepts exactly one column for these; define one index per column.",
	);
}

/** The `FULLTEXT …` portion of an index definition. */
function fulltextClause(fulltext: true | FulltextOptions): string[] {
	const options = fulltext === true ? {} : fulltext;
	const parts = ["FULLTEXT"];

	if (options.analyzer) parts.push("ANALYZER", options.analyzer);

	// SurrealDB reports BM25 on every full-text index, tuned or not, so it is
	// always emitted with the parameters it would fill in.
	const bm25 =
		typeof options.bm25 === "object" ? options.bm25 : { k1: 1.2, b: 0.75 };
	parts.push(`BM25(${bm25.k1},${bm25.b})`);

	if (options.highlights) parts.push("HIGHLIGHTS");

	return parts;
}

/** The `HNSW …` portion of an index definition, with defaults filled in. */
function hnswClause(hnsw: HnswOptions): string[] {
	const m = hnsw.m ?? HNSW_DEFAULTS.m;

	return [
		"HNSW",
		"DIMENSION",
		String(hnsw.dimension),
		"DIST",
		hnsw.dist ?? HNSW_DEFAULTS.dist,
		"TYPE",
		hnsw.type ?? HNSW_DEFAULTS.type,
		"EFC",
		String(hnsw.efc ?? HNSW_DEFAULTS.efc),
		"M",
		String(m),
		"M0",
		String(hnsw.m0 ?? m * 2),
	];
}
