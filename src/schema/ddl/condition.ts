/**
 * Tidy a rendered condition the way SurrealDB stores it.
 *
 * `and()` and `or()` parenthesise whatever they join, which is always correct
 * and often redundant: `a OR (b AND c)` means what `a OR b AND c` does, since
 * `AND` binds tighter. SurrealDB drops the redundant parentheses when it stores
 * a definition and keeps the ones that matter, so a definition written with them
 * would read back different and be redefined on every plan.
 *
 * Only parentheses around a joined group are considered, and only as an operand
 * of a join or around the whole condition; a call's own parentheses, and those
 * after a prefix such as `!`, are never touched.
 */

type Join = "AND" | "OR";

const JOIN = /^ (AND|OR) /;

/** Remove the redundant parentheses `and()` and `or()` leave around a condition. */
export function simplifyCondition(condition: string): string {
	return simplify(condition.trim()).text;
}

function simplify(text: string): { text: string; join?: Join } {
	const { operands, joins } = split(text);

	if (operands.length === 1) {
		const only = operands[0] as string;
		return isWrapped(only)
			? simplify(only.slice(1, -1).trim())
			: { text: collapse(only) };
	}

	const parts = operands.map((operand) => {
		if (!isWrapped(operand)) return collapse(operand);

		const inner = simplify(operand.slice(1, -1).trim());
		if (!inner.join) return inner.text;

		// `AND` binds tighter than `OR` and is associative, so a group of it never
		// needs parentheses. A group of `OR` needs them only inside an `AND`.
		const redundant = inner.join === "AND" || joins.every((j) => j === "OR");
		return redundant ? inner.text : `(${inner.text})`;
	});

	const mixed = joins.includes("AND") && joins.includes("OR");
	const joined = parts.map((part, i) =>
		i ? ` ${joins[i - 1]} ${part}` : part,
	);
	return { text: joined.join(""), join: mixed ? "OR" : (joins[0] as Join) };
}

/** Split at the `AND` / `OR` that are not inside parentheses or quotes. */
function split(text: string): { operands: string[]; joins: Join[] } {
	const operands: string[] = [];
	const joins: Join[] = [];
	let start = 0;

	for (const { i, char, depth } of unquoted(text)) {
		if (i < start || depth !== 0 || char !== " ") continue;
		const join = JOIN.exec(text.slice(i, i + 5));
		if (!join) continue;
		operands.push(text.slice(start, i).trim());
		joins.push(join[1] as Join);
		start = i + join[0].length;
	}
	operands.push(text.slice(start).trim());
	return { operands, joins };
}

/** Whether one pair of parentheses encloses all of `text`. */
function isWrapped(text: string): boolean {
	return text.startsWith("(") && closing(text, 0) === text.length - 1;
}

/** The index of the `)` matching the `(` at `open`, skipping quoted text, or -1. */
function closing(text: string, open: number): number {
	for (const { i, char, depth } of unquoted(text.slice(open))) {
		if (char === ")" && depth === 0) return open + i;
	}
	return -1;
}

/**
 * The characters outside quotes, each with the depth of parentheses it sits at.
 * A parenthesis is at the depth outside it, so the pair around a group share one.
 */
function* unquoted(
	text: string,
): Generator<{ i: number; char: string; depth: number }> {
	let depth = 0;

	for (let i = 0; i < text.length; i++) {
		const char = text[i] as string;
		if (QUOTES.includes(char)) {
			i = endOfQuote(text, i);
			continue;
		}
		if (char === ")") depth--;
		yield { i, char, depth };
		if (char === "(") depth++;
	}
}

const QUOTES = ["'", '"', "`"];

/** The index of the quote that closes the one at `open`, or the end of `text`. */
function endOfQuote(text: string, open: number): number {
	for (let i = open + 1; i < text.length; i++) {
		if (text[i] === "\\") i++;
		else if (text[i] === text[open]) return i;
	}
	return text.length;
}

/** `not((a OR b))` is `not(a OR b)`: drop a pair that wraps exactly one other. */
function collapse(text: string): string {
	for (let i = 0; i < text.length - 1; i++) {
		if (text[i] !== "(" || text[i + 1] !== "(") continue;
		const outer = closing(text, i);
		if (outer !== -1 && closing(text, i + 1) === outer - 1) {
			return collapse(
				text.slice(0, i) + text.slice(i + 1, outer) + text.slice(outer + 1),
			);
		}
	}
	return text;
}
