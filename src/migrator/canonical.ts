/**
 * Reducing `DEFINE` statements to a comparable form.
 *
 * A migration needs to answer one question: does what the schema says match
 * what the database has? Both sides are `DEFINE` statements, but they are
 * spelled differently — SurrealDB rewrites a definition when it stores it, and
 * fills in defaults that were never written.
 *
 * Rather than predict those rewrites, both sides are reduced to the same
 * canonical form and compared. Every rule below was found by writing a
 * statement, reading it back, and diffing the two; they are pinned in
 * tests/integration/canonical.test.ts so a change in SurrealDB surfaces as a
 * failing test rather than a migration that never converges.
 */

/** Clauses that can follow a field's type, marking where the type ends. */
const AFTER_TYPE =
	/\s+(FLEXIBLE|DEFAULT|VALUE|READONLY|REFERENCE|ASSERT|PERMISSIONS|COMMENT)\b/i;

/** Textual rewrites that apply to the whole statement. */
const RULES: [RegExp, string][] = [
	// `DEFINE FIELD x ON TABLE t` is stored as `DEFINE FIELD x ON t`
	[/\bON\s+TABLE\s+/gi, "ON "],
	// OVERWRITE says how a statement is applied, not what it defines
	[/\bDEFINE\s+(FIELD|TABLE)\s+OVERWRITE\s+/gi, "DEFINE $1 "],
	// SurrealDB backticks identifiers when it stores them — function namespaces
	// (`rand`::uuid::v7()) and any field whose name is a reserved word (`by`).
	// Applied to both sides, so a genuine backtick inside a string literal would
	// be stripped from both and still compare equal.
	[/`([A-Za-z_][A-Za-z0-9_]*)`/g, "$1"],
	// Array element fields are reported with dots but defined with brackets
	[/\[\*\]/g, ".*"],
	// SurrealDB fills these in; their absence means the same thing
	[/\s+PERMISSIONS\s+(FULL|NONE)\b/gi, ""],
	// SurrealDB stores string literals single-quoted. Only rewrite literals with
	// no quote of either kind inside, so an apostrophe cannot change the meaning.
	[/"([^"'\\]*)"/g, "'$1'"],
	// Whitespace carries no meaning between tokens
	[/\s+/g, " "],
];

/**
 * Reduce a `DEFINE` statement to the form used for comparison.
 *
 * @param statement - A generated or stored `DEFINE` statement
 * @returns A canonical string, comparable with any other canonicalised statement
 */
export function canonicalise(statement: string): string {
	let result = statement.trim().replace(/;$/, "");

	for (const [pattern, replacement] of RULES) {
		result = result.replace(pattern, replacement);
	}

	return normaliseTypeClause(result).trim();
}

/** Whether two `DEFINE` statements define the same thing. */
export function equivalent(a: string, b: string): boolean {
	return canonicalise(a) === canonicalise(b);
}

/**
 * Rewrite `option<T>` as `none | T` wherever it appears in a type expression.
 *
 * This is how SurrealDB stores optionality, at every level of nesting:
 * `option<array<option<record<user>>>>` comes back as
 * `none | array<none | record<user>>`.
 */
export function normaliseTypeExpression(expression: string): string {
	let out = "";
	let i = 0;

	while (i < expression.length) {
		if (!expression.startsWith("option<", i)) {
			out += expression[i];
			i += 1;
			continue;
		}

		const open = i + "option".length;
		const close = matchAngleBracket(expression, open);
		if (close === -1) {
			// Unbalanced; leave the rest alone rather than corrupt it
			out += expression.slice(i);
			break;
		}

		out += `none | ${normaliseTypeExpression(expression.slice(open + 1, close))}`;
		i = close + 1;
	}

	return out;
}

/** Index of the `>` matching the `<` at `openIndex`, or -1 if unbalanced. */
function matchAngleBracket(input: string, openIndex: number): number {
	let depth = 0;

	for (let i = openIndex; i < input.length; i++) {
		if (input[i] === "<") depth += 1;
		else if (input[i] === ">") {
			depth -= 1;
			if (depth === 0) return i;
		}
	}

	return -1;
}

/** Apply type-expression normalisation to just the `TYPE …` clause. */
function normaliseTypeClause(statement: string): string {
	const start = statement.search(/\bTYPE\s+/i);
	if (start === -1) return statement;

	const typeStart =
		start + statement.slice(start).match(/\bTYPE\s+/i)![0].length;
	const rest = statement.slice(typeStart);
	const end = rest.search(AFTER_TYPE);

	const expression = end === -1 ? rest : rest.slice(0, end);
	const trailing = end === -1 ? "" : rest.slice(end);

	return (
		statement.slice(0, typeStart) +
		normaliseTypeExpression(expression) +
		trailing
	);
}
