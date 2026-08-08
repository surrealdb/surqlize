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
	// CONCURRENTLY says how to build an index, not what it is, and is not stored
	[/\s+CONCURRENTLY\b/gi, ""],
	// HNSW derives LM from M, as a long float. Comparing it adds nothing that
	// comparing M does not, and matching the printed precision is fragile.
	[/\s+LM\s+[\d.]+f?/gi, ""],
	// SurrealDB stores string literals single-quoted. Only rewrite literals with
	// no quote of either kind inside, so an apostrophe cannot change the meaning.
	[/"([^"'\\]*)"/g, "'$1'"],
	// Whitespace carries no meaning between tokens
	[/\s+/g, " "],
	// Nor does spacing around a separator: TOKENIZERS BLANK,CLASS is stored
	// unspaced while FILTERS LOWERCASE, ASCII is spaced.
	[/\s*,\s*/g, ", "],
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

	// COMMENT and PERMISSIONS are written in either order but stored in one, so
	// both are lifted out and re-appended in a fixed position.
	const { body, comment, permissions } = extractTrailingClauses(result);

	const parts = [normaliseTypeClause(body).trim()];
	if (comment) parts.push(`COMMENT ${comment}`);

	// Only fields and tables take a rule per operation. Everywhere else
	// PERMISSIONS is a single value that SurrealDB fills in as FULL.
	if (/^DEFINE (FIELD|TABLE)\b/i.test(result)) {
		parts.push(
			normalisePermissions(permissions, /^DEFINE FIELD\b/i.test(result)),
		);
	} else if (permissions && !/^(FULL|NONE)$/i.test(permissions)) {
		parts.push(`PERMISSIONS ${permissions}`);
	}

	return unwrapThen(parts.join(" ").trim());
}

/**
 * Remove the parentheses SurrealDB puts around an event's `THEN` body.
 *
 * `THEN UPDATE …` is stored as `THEN (UPDATE …)`. Stripping them from both
 * sides is simpler than predicting when they are added, and a body that was
 * written parenthesised means the same thing either way.
 */
function unwrapThen(statement: string): string {
	const start = statement.search(/\bTHEN\s+\(/);
	if (start === -1) return statement;

	const open = statement.indexOf("(", start);
	const close = matchParen(statement, open);
	if (close === -1) return statement;

	return (
		statement.slice(0, open) +
		statement.slice(open + 1, close) +
		statement.slice(close + 1)
	);
}

/** Index of the `)` matching the `(` at `openIndex`, or -1 if unbalanced. */
function matchParen(input: string, openIndex: number): number {
	let depth = 0;

	for (let i = openIndex; i < input.length; i++) {
		if (input[i] === "(") depth += 1;
		else if (input[i] === ")") {
			depth -= 1;
			if (depth === 0) return i;
		}
	}

	return -1;
}

/**
 * Split a statement into its body and its `COMMENT`/`PERMISSIONS` clauses.
 *
 * Both are always last, so whichever comes first marks the end of the body.
 */
function extractTrailingClauses(statement: string): {
	body: string;
	comment: string | null;
	permissions: string | null;
} {
	const comment = statement.match(/\sCOMMENT\s+('[^']*'|"[^"]*")/i);
	const permissions = statement.match(
		/\sPERMISSIONS\s+(.+?)(?=\sCOMMENT\s|$)/i,
	);

	let body = statement;
	if (comment) body = body.replace(comment[0], "");
	if (permissions) body = body.replace(permissions[0], "");

	return {
		body: body.trim(),
		comment: comment?.[1] ?? null,
		permissions: permissions?.[1]?.trim() ?? null,
	};
}

/**
 * Expand a `PERMISSIONS` clause to a rule per operation.
 *
 * SurrealDB always reports the full expansion, filling in whatever was not
 * specified — `PERMISSIONS FOR select FULL` on a table comes back as
 * `FOR select FULL, FOR create, update, delete NONE`. Writing both sides out in
 * full, in a fixed order, makes the two comparable.
 *
 * The default for an unmentioned operation differs by kind: a field is `FULL`,
 * a table is `NONE`.
 */
function normalisePermissions(clause: string | null, isField: boolean): string {
	const fallback = isField ? "FULL" : "NONE";
	const rules: Record<Operation, string> = {
		create: fallback,
		delete: fallback,
		select: fallback,
		update: fallback,
	};

	if (clause && !/^(FULL|NONE)$/i.test(clause)) {
		for (const group of clause.split(/\bFOR\b/i)) {
			const trimmed = group.trim().replace(/,$/, "").trim();
			if (!trimmed) continue;

			const [operations, rule] = splitOperations(trimmed);
			for (const operation of operations) rules[operation] = rule;
		}
	} else if (clause) {
		for (const operation of OPERATIONS) rules[operation] = clause.toUpperCase();
	}

	return `PERMISSIONS ${OPERATIONS.map((op) => `FOR ${op} ${rules[op]}`).join(", ")}`;
}

/** Split `select, create WHERE x` into its operations and its rule. */
function splitOperations(group: string): [Operation[], string] {
	const operations: Operation[] = [];
	let rest = group;

	while (true) {
		const match = rest.match(/^(create|delete|select|update)\s*,?\s*/i);
		if (!match) break;
		operations.push(match[1]!.toLowerCase() as Operation);
		rest = rest.slice(match[0].length);
	}

	return [operations, rest.trim() || "FULL"];
}

/** The operations a `PERMISSIONS` clause can name, in a fixed order. */
const OPERATIONS = ["create", "delete", "select", "update"] as const;

type Operation = (typeof OPERATIONS)[number];

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
