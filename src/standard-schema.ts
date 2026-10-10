import { AbstractType } from "./types/classes";
import { checkValue, type ValidationIssue } from "./validation";

/**
 * The [Standard Schema](https://standardschema.dev) interface, declared as
 * types only so that Surqlize takes no dependency on it. Every `t.*` type
 * implements it, which lets one definition validate in other libraries that
 * accept a Standard Schema, such as the `surrealdb` SDK's `.args()`,
 * `.returns()`, `.request()` and `.response()`.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
	readonly "~standard": StandardSchemaProps<Input, Output>;
}

export interface StandardSchemaProps<Input = unknown, Output = Input> {
	readonly version: 1;
	readonly vendor: string;
	readonly validate: (
		value: unknown,
	) =>
		| { readonly value: Output; readonly issues?: undefined }
		| { readonly issues: readonly StandardIssue[] };
	readonly types?: { readonly input: Input; readonly output: Output };
}

export type StandardIssue = {
	readonly message: string;
	readonly path?: readonly PropertyKey[];
};

declare module "./types/classes" {
	interface AbstractType<T> {
		/** See {@link StandardSchemaV1}. */
		readonly "~standard": StandardSchemaProps<unknown, T>;
	}
}

const SEGMENT = /([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]|\[("(?:[^"\\]|\\.)*")\]/g;

/** Turn an issue path such as `address.tags[0]` into `["address", "tags", 0]`. */
export function pathOf(path: string): PropertyKey[] {
	if (path === "(root)" || path === "") return [];
	const segments: PropertyKey[] = [];
	for (const [, key, index, quoted] of path.matchAll(SEGMENT)) {
		if (key !== undefined) segments.push(key);
		else if (index !== undefined) segments.push(Number(index));
		else if (quoted !== undefined) segments.push(JSON.parse(quoted));
	}
	return segments;
}

const toStandard = (issue: ValidationIssue): StandardIssue => ({
	// The message of an issue starts with its path, which a Standard Schema
	// issue carries separately.
	message: issue.message.slice(issue.path.length + 2),
	path: pathOf(issue.path),
});

/**
 * Give every type a `~standard` property. Called by the modules that define
 * the `t.*` builders rather than run as a bare side effect, so that a bundler
 * honouring `"sideEffects": false` keeps it.
 */
export function installStandardSchema(): void {
	if (Object.hasOwn(AbstractType.prototype, "~standard")) return;
	Object.defineProperty(AbstractType.prototype, "~standard", {
		configurable: true,
		get(this: AbstractType) {
			return {
				version: 1 as const,
				vendor: "surqlize",
				validate: (value: unknown) => {
					const issues = checkValue(this, value);
					return issues.length === 0
						? { value }
						: { issues: issues.map(toStandard) };
				},
			};
		},
	});
}
