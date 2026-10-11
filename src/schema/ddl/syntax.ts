import { escapeIdent } from "surrealdb";

const PLAIN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A table, field, index or event name, escaped when it is not a plain
 * identifier (`order-item` becomes `⟨order-item⟩`). Plain names are unchanged,
 * keywords included: the SDK's `escapeIdent` also escapes a word such as `by`,
 * but the database stores it bare, so a statement that escaped it would never
 * equal the stored one and a migration would never settle.
 */
export function ident(name: string): string {
	return PLAIN.test(name) ? name : escapeIdent(name);
}

/**
 * A field path such as `address.street` or `items[*].name`, with each name
 * escaped and the `[*]` element wildcards kept as they are.
 */
export function fieldPath(path: string): string {
	return path
		.split(".")
		.map((segment) => {
			const wildcards = segment.match(/(\[\*\])+$/)?.[0] ?? "";
			return (
				ident(segment.slice(0, segment.length - wildcards.length)) + wildcards
			);
		})
		.join(".");
}

/**
 * Quote a string for SurrealQL, escaping any embedded quotes.
 *
 * Single quotes are the default because that is how SurrealDB stores string
 * literals; emitting double quotes would make every commented field look
 * modified on the next diff.
 */
export function quote(value: string, mark = "'"): string {
	// SurrealDB picks whichever quote avoids escaping: a string holding an
	// apostrophe is stored double-quoted, and vice versa. Matching that keeps a
	// declared default equal to the stored one.
	if (mark === "'" && value.includes("'") && !value.includes('"')) {
		return `"${value}"`;
	}

	return `${mark}${value.split(mark).join(`\\${mark}`)}${mark}`;
}
