/**
 * Semantic search over embeddings.
 *
 * The combination most likely to disagree with the database: an HNSW vector
 * index, a full-text index, and a custom analyzer, in one schema.
 *
 *   bun sur plan    --schema examples/ai-embeddings.ts
 *   bun sur migrate --schema examples/ai-embeddings.ts
 */
import { analyzer, t, table } from "../src";

/** Splits identifiers as well as prose, for technical writing. */
export const tech = analyzer("tech", {
	tokenizers: ["blank", "class", "camel"],
	filters: ["lowercase", "ascii"],
});

export const document = table("document", {
	title: t.string().assert("$value != NONE"),
	content: t.string().assert("$value != NONE"),
	summary: t.string(),

	category: t.string(),
	tags: t.array(t.string()).default([]),
	author: t.record("user"),

	/** An OpenAI ada-002 embedding, hence 1536 dimensions below. */
	embedding: t.array(t.float()),

	createdAt: t.date().default("time::now()"),
	updatedAt: t.date(),
})
	.comment("Documents with semantic embeddings")
	.index("document_semantic", {
		fields: ["embedding"],
		hnsw: { dimension: 1536, dist: "COSINE", efc: 200, m: 16 },
	})
	// Full-text takes exactly one column.
	.index("document_search", {
		fields: ["content"],
		fulltext: { analyzer: "tech", highlights: true },
	})
	.index("document_category", { fields: ["category"] })
	.index("document_tags", { fields: ["tags"] });

export const searchHistory = table("search_history", {
	query: t.string().assert("$value != NONE"),
	user: t.record("user"),
	results: t.array(t.record("document")),
	searchedAt: t.date().default("time::now()"),
});

export const documentSimilarity = table("document_similarity", {
	source: t.record("document").assert("$value != NONE"),
	target: t.record("document").assert("$value != NONE"),
	score: t.float().assert("$value != NONE"),
	computedAt: t.date().default("time::now()"),
})
	.comment("Pre-computed similar document pairs")
	.index("similarity_source", { fields: ["source"] })
	.index("similarity_source_score", { fields: ["source", "score"] });

export default [tech, document, searchHistory, documentSimilarity];
