/** Any class that can be linked to a table with `table(tb, fields, Class)`. */
// biome-ignore lint/suspicious/noExplicitAny: constructors take arbitrary arguments
export type ModelClass = abstract new (...args: any[]) => object;

const modelClasses = new WeakSet<object>();

/** Remember `cls` as a class linked to a table. */
export function registerModelClass(cls: ModelClass): void {
	modelClasses.add(cls);
}

/**
 * Turn an instance of a table-linked class into a plain object made of its own
 * enumerable properties, so it is sent to SurrealDB as a record's content.
 * Arrays are converted element-wise; any other value is returned untouched.
 */
export function toPlainModel(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(toPlainModel);
	if (
		typeof value === "object" &&
		value !== null &&
		modelClasses.has(value.constructor)
	) {
		return { ...value };
	}
	return value;
}
