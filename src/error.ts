export class OrmError extends Error {}

export class TypeParseError extends Error {
	constructor(
		public readonly name: string,
		public readonly expected: string | [string, string, ...string[]],
		public readonly found: unknown,
	) {
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
	}
}
