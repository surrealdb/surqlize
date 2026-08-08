/** When an event fires. */
export type EventTrigger = "CREATE" | "UPDATE" | "DELETE";

/** What an event responds to and what it does. */
export interface EventOptions {
	/**
	 * The operations that fire it. Omitting this fires on every change.
	 *
	 * This becomes a `$event` guard in the generated `WHEN` clause. Without one
	 * the clause would be empty, and SurrealDB accepts `WHEN NULL` silently —
	 * the event is created and simply never runs.
	 */
	on?: EventTrigger | EventTrigger[];
	/** An extra condition, ANDed onto the trigger guard. */
	when?: string;
	/**
	 * The SurrealQL to run.
	 *
	 * Named `body` rather than `then` — matching `storedFunction` — because an
	 * object carrying a `then` property is treated as a thenable by `await`.
	 */
	body: string;
	comment?: string;
	/** Previous names, so a rename redefines rather than dropping and recreating. */
	previousNames?: string[];
}

/** An event attached to a table. */
export interface EventDefinition extends EventOptions {
	name: string;
}

/**
 * Render a `DEFINE EVENT` statement.
 *
 * @param tableName - The table the event belongs to
 * @param event - What fires it and what it does
 * @param options - Whether to replace an existing definition
 * @returns A complete `DEFINE EVENT` statement
 */
export function defineEvent(
	tableName: string,
	event: EventDefinition,
	options: { overwrite?: boolean } = {},
): string {
	const parts = ["DEFINE EVENT"];
	if (options.overwrite) parts.push("OVERWRITE");
	parts.push(event.name, "ON TABLE", tableName);

	parts.push("WHEN", buildWhen(event));
	parts.push("THEN", wrapThen(event.body));

	if (event.comment) {
		parts.push("COMMENT", `'${event.comment.replace(/'/g, "\\'")}'`);
	}

	return `${parts.join(" ")};`;
}

/**
 * Build the `WHEN` expression from the trigger and any extra condition.
 *
 * The user's condition is parenthesised so its own operators cannot swallow the
 * trigger guard — `$event = "CREATE" AND (a OR b)` rather than
 * `$event = "CREATE" AND a OR b`, which would fire on every update matching `b`.
 */
function buildWhen(event: EventOptions): string {
	const triggers = event.on
		? Array.isArray(event.on)
			? event.on
			: [event.on]
		: [];

	const guard = triggers.length
		? triggers.map((op) => `$event = "${op}"`).join(" OR ")
		: null;

	if (guard && event.when) {
		const left = triggers.length > 1 ? `(${guard})` : guard;
		// SurrealDB drops parentheses it does not need, so only add them when the
		// condition could otherwise swallow the guard — `$event = "CREATE" AND
		// (a OR b)` rather than `$event = "CREATE" AND a OR b`, which would fire
		// on every update matching `b`.
		const right = hasTopLevelOr(event.when) ? `(${event.when})` : event.when;
		return `${left} AND ${right}`;
	}

	// With neither, fire on every change rather than never.
	return guard ?? event.when ?? "true";
}

/** Whether `condition` contains an `OR` outside any parentheses or quotes. */
function hasTopLevelOr(condition: string): boolean {
	// Blank out nested content so a word boundary still means what it did.
	let masked = condition;
	let previous: string;
	do {
		previous = masked;
		masked = masked.replace(/\([^()]*\)|'[^']*'|"[^"]*"/g, (m) =>
			" ".repeat(m.length),
		);
	} while (masked !== previous);

	return masked.search(/\bOR\b/i) !== -1;
}

/** Wrap a multi-statement body in a block, which SurrealDB requires. */
function wrapThen(body: string): string {
	const trimmed = body.trim();
	if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
	if (trimmed.includes(";") || /\b(FOR|IF|LET)\b/.test(trimmed)) {
		return `{ ${trimmed} }`;
	}
	return trimmed;
}
