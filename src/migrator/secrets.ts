/**
 * Keeping signing keys out of what a migration prints and records.
 *
 * An access method's key is the one thing a migration holds that cannot be read
 * back: SurrealDB stores it and reports it as `'[REDACTED]'`. Two problems
 * follow from that, and both are handled here.
 *
 * - The statement that sets a key has to carry it, so printing or recording that
 *   statement leaks it. {@link redactSecrets} writes the form that is safe to
 *   print and to keep in the history.
 * - A statement built from the reported text would set the key to the literal
 *   `[REDACTED]`, which anyone can sign a token with. {@link restoreStatement}
 *   never writes one, and {@link unrestorableAccess} finds one in a history that
 *   was written before.
 */

/**
 * What stands in for a key in text that is printed or recorded.
 *
 * It is not valid SurrealQL, on purpose: pasting the text back into a query is
 * an error rather than an access method with a key of its own choosing.
 */
const PLACEHOLDER = "<redacted>";

/** What SurrealDB reports in place of a key. */
const REPORTED = "[REDACTED]";

/** The marker that stands in `down` for a restore that cannot be written. */
const MARKER = "-- cannot restore access ";

/** What the marker says after the access name. */
const MARKER_REASON = ": its keys are not readable from the database";

/**
 * A statement that defines an access method, capturing its name.
 *
 * A name that needs escaping is quoted in backticks or angle brackets and can
 * hold spaces, colons and an escaped closing quote, so it is taken whole.
 */
const DEFINE_ACCESS =
	/^\s*DEFINE\s+ACCESS\s+(?:OVERWRITE\s+|IF\s+NOT\s+EXISTS\s+)?(`(?:[^`\\]|\\.)*`|⟨(?:[^⟩\\]|\\.)*⟩|\S+)/i;

/** One key clause: where its string literal starts and ends, and what it says. */
interface KeyLiteral {
	start: number;
	end: number;
	value: string;
}

/**
 * Find every `KEY '…'` in a statement, in either quote style.
 *
 * String literals are skipped as a whole, so the word `KEY` inside a query or a
 * comment is not mistaken for a clause, and a key holding a quote, a backslash
 * or the word `KEY` is taken to its real end. The escapes are the ones the
 * statement builder writes: a backslash escapes the next character.
 */
function keyLiterals(statement: string): KeyLiteral[] {
	const found: KeyLiteral[] = [];
	let i = 0;

	while (i < statement.length) {
		const char = statement[i] as string;

		if (char === "'" || char === '"') {
			i = endOfString(statement, i);
			continue;
		}

		if (isKeyword(statement, i)) {
			let next = i + 3;
			while (/\s/.test(statement[next] ?? "")) next += 1;

			const quote = statement[next];
			if (quote === "'" || quote === '"') {
				const end = endOfString(statement, next);
				found.push({
					start: next,
					end,
					value: statement.slice(next + 1, end - 1),
				});
				i = end;
				continue;
			}
		}

		i += 1;
	}

	return found;
}

/** The index just past the string literal that opens at `start`. */
function endOfString(statement: string, start: number): number {
	const quote = statement[start];
	let i = start + 1;

	while (i < statement.length) {
		if (statement[i] === "\\") i += 2;
		else if (statement[i] === quote) return i + 1;
		else i += 1;
	}

	return statement.length;
}

/** Whether the word `KEY` starts at `index`, standing alone. */
function isKeyword(statement: string, index: number): boolean {
	if (statement.slice(index, index + 3).toUpperCase() !== "KEY") return false;

	return (
		!/[A-Za-z0-9_]/.test(statement[index - 1] ?? "") &&
		!/[A-Za-z0-9_]/.test(statement[index + 3] ?? "")
	);
}

/**
 * The form of a statement that is safe to print and to record.
 *
 * Every key in a `DEFINE ACCESS` is replaced with a placeholder; anything else
 * comes back unchanged.
 */
export function redactSecrets(statement: string): string {
	if (!DEFINE_ACCESS.test(statement)) return statement;

	let out = "";
	let from = 0;

	for (const { start, end } of keyLiterals(statement)) {
		out += statement.slice(from, start) + PLACEHOLDER;
		from = end;
	}

	return out + statement.slice(from);
}

/** Whether a statement defines an access method with a key SurrealDB hid. */
function hidesKey(statement: string): boolean {
	return (
		DEFINE_ACCESS.test(statement) &&
		keyLiterals(statement).some(({ value }) => value === REPORTED)
	);
}

/**
 * The statement that restores a definition from the text the database reported.
 *
 * Ordinarily that text, ended with a semicolon. When it hides a key, a statement
 * built from it would set the key to the literal `[REDACTED]`, so a comment
 * naming the access is written instead. It runs as nothing, and
 * {@link unrestorableAccess} reads it back, so a rollback stops rather than
 * claiming to have restored what it could not.
 */
export function restoreStatement(reported: string): string {
	if (!hidesKey(reported)) return `${reported};`;

	const name = DEFINE_ACCESS.exec(reported)?.[1] ?? "";
	return `${MARKER}${name}${MARKER_REASON}`;
}

/**
 * The access method that a set of `down` statements would restore with a key
 * that was hidden, or undefined when there is none.
 *
 * Two forms count. The marker {@link restoreStatement} writes, and a statement
 * that sets the key to the text SurrealDB reports, which is what a history
 * written before the marker holds. It reads `down` whatever the age of the row.
 */
export function unrestorableAccess(down: string[]): string | undefined {
	for (const statement of down) {
		if (statement.startsWith(MARKER)) {
			// The name can hold a colon, so cut the known ending off rather than
			// splitting at the first one.
			const named = statement.slice(MARKER.length);
			return named.endsWith(MARKER_REASON)
				? named.slice(0, -MARKER_REASON.length)
				: named;
		}
		if (hidesKey(statement)) return DEFINE_ACCESS.exec(statement)?.[1];
	}

	return undefined;
}
