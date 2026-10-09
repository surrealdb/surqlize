export class OrmError extends Error {}

/** One failed check found while validating data against a schema. */
export type ValidationIssue = {
	/** Where the value sits, e.g. `age`, `address.city` or `tags[1]`; `(root)` for the data itself. */
	readonly path: string;
	/** What the schema expects there, e.g. `number`, `Date` or `string or number`. */
	readonly expected: string;
	/** The value that was found (`undefined` when the field is missing). */
	readonly received: unknown;
	/** A readable one-line description of the issue. */
	readonly message: string;
};

/**
 * Thrown when data does not match a table's schema. Unlike
 * {@link TypeParseError}, which stops at the first mismatch, it carries every
 * failing field in {@link ValidationError.issues}.
 */
export class ValidationError extends OrmError {
	constructor(
		readonly issues: readonly ValidationIssue[],
		readonly table?: string,
	) {
		const where = table === undefined ? "data" : `data for table "${table}"`;
		const count = `${issues.length} validation error${issues.length === 1 ? "" : "s"}`;
		super(
			`Invalid ${where}: ${count}\n${issues.map((i) => `  - ${i.message}`).join("\n")}`,
		);
		this.name = "ValidationError";
	}
}

/**
 * Thrown when a query fails in the way a duplicated `surrealdb` install makes
 * it fail. Surqlize binds query subjects as the SDK's `Table`, and the SDK
 * encodes by `instanceof`: with two copies of the package the connection does
 * not recognise Surqlize's `Table`, encodes it as an empty object, and the
 * server answers `Cannot execute ... statement using value: {  }`. The original
 * rejection is kept as `cause`.
 */
export class DuplicateSurrealError extends OrmError {
	constructor(options?: { cause?: unknown }) {
		super(
			[
				"Query subjects could not be encoded: this looks like more than one copy of the `surrealdb` package is installed.",
				"The connection passed to Surqlize comes from a different `surrealdb` install than the one Surqlize imports, so the SDK's `instanceof` checks fail and subjects such as `Table` are sent as empty objects.",
				"To fix it, make sure a single copy of `surrealdb` is resolved: run `npm ls surrealdb` (or `bun pm ls --all`), dedupe or add an `overrides`/`resolutions` entry so one version is used, and avoid `file:` dependencies that bring their own `node_modules`.",
				"If the project is symlinked and TypeScript reports `Property '#private' in type 'Surreal' refers to a different member`, set `preserveSymlinks: true`.",
			].join(" "),
			options,
		);
		this.name = "DuplicateSurrealError";
	}
}

export class TypeParseError extends Error {
	public readonly name: string;
	public readonly expected: string | [string, string, ...string[]];
	public readonly found: unknown;

	constructor(
		name: string,
		expected: string | [string, string, ...string[]],
		found: unknown,
	) {
		// Call super() first before accessing this
		if (Array.isArray(expected)) {
			const expected_str =
				expected.length <= 1
					? expected.join("")
					: expected.length === 2
						? expected.join(" or ")
						: `${expected.slice(0, -1).join(", ")} or ${expected.slice(-1)}`;

			super(`Expected ${expected_str} but found ${found}`);
		} else {
			super(`Expected ${expected} but found ${found}`);
		}

		// Now assign properties
		this.name = name;
		this.expected = expected;
		this.found = found;
	}
}
