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
	return toPlainValue(value, new WeakMap());
}

function toPlainValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
	if (typeof value !== "object" || value === null) return value;
	const existing = seen.get(value);
	if (existing !== undefined) return existing;

	if (Array.isArray(value)) {
		const result: unknown[] = [];
		seen.set(value, result);
		for (const item of value) result.push(toPlainValue(item, seen));
		return result;
	}

	if (value instanceof Set) {
		const result = new Set<unknown>();
		seen.set(value, result);
		for (const item of value) result.add(toPlainValue(item, seen));
		return result;
	}

	const isModel = modelClasses.has(value.constructor);
	const prototype = Object.getPrototypeOf(value);
	if (!isModel && prototype !== Object.prototype && prototype !== null) {
		return value;
	}
	return toPlainObject(value, isModel, seen);
}

function toPlainObject(
	value: object,
	isModel: boolean,
	seen: WeakMap<object, unknown>,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	seen.set(value, result);
	for (const [key, field] of Object.entries(value)) {
		// Constructor-initialized arrow methods are own properties too; they are
		// model behavior, not data to send to SurrealDB.
		if (
			isModel &&
			(key === "$orm" ||
				key === "select" ||
				key === "update" ||
				key === "delete" ||
				typeof field === "function")
		)
			continue;
		result[key] = toPlainValue(field, seen);
	}
	return result;
}
