export class OrmError extends Error {}

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
