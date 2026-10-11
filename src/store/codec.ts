import { Duration, RecordId, Uuid } from "surrealdb";

const TAG = "$t";

/**
 * Turn a value into a string that keeps what JSON loses: dates, record ids,
 * uuids, durations and bigints. Used to store pending writes, which may outlive
 * the page that made them.
 *
 * @throws {TypeError} For a value that cannot be stored, such as a function or
 *   an instance of a class the codec does not know.
 */
export function encode(value: unknown): string {
	return JSON.stringify(toJson(value, "value"));
}

/** The inverse of {@link encode}. */
export function decode(text: string): unknown {
	return fromJson(JSON.parse(text));
}

function toJson(value: unknown, path: string): unknown {
	if (value === undefined) return { [TAG]: "undefined" };
	if (typeof value === "number") {
		return Number.isFinite(value)
			? value
			: { [TAG]: "number", v: String(value) };
	}
	if (value === null || typeof value === "string" || typeof value === "boolean")
		return value;
	if (Array.isArray(value))
		return value.map((v, i) => toJson(v, `${path}[${i}]`));
	if (
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	) {
		return plainToJson(value as Record<string, unknown>, path);
	}
	return valueToJson(value, path);
}

/** A bigint, or an instance of a class of the SDK that has a text form. */
function valueToJson(value: unknown, path: string): unknown {
	if (typeof value === "bigint")
		return { [TAG]: "bigint", v: value.toString() };
	if (value instanceof Date) return { [TAG]: "date", v: value.toISOString() };
	if (value instanceof RecordId) {
		return {
			[TAG]: "rid",
			table: String(value.table),
			id: toJson(value.id, path),
		};
	}
	if (value instanceof Uuid) return { [TAG]: "uuid", v: value.toString() };
	if (value instanceof Duration) return { [TAG]: "dur", v: value.toString() };
	const name = (value as object)?.constructor?.name ?? typeof value;
	throw new TypeError(`${path} (${name}) cannot be stored in the outbox`);
}

function plainToJson(value: Record<string, unknown>, path: string): unknown {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value))
		out[k] = toJson(v, `${path}.${k}`);
	// An object with a key of its own named like the tag must not be mistaken for one.
	return TAG in out ? { [TAG]: "obj", v: out } : out;
}

function fromJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(fromJson);
	if (typeof value !== "object" || value === null) return value;
	const object = value as Record<string, unknown>;
	switch (object[TAG]) {
		case undefined:
			break;
		case "undefined":
			return undefined;
		case "number":
			return Number(object.v);
		case "bigint":
			return BigInt(object.v as string);
		case "date":
			return new Date(object.v as string);
		case "rid":
			return new RecordId(object.table as string, fromJson(object.id) as never);
		case "uuid":
			return new Uuid(object.v as string);
		case "dur":
			return new Duration(object.v as string);
		case "obj":
			return decodeObject(object.v as Record<string, unknown>);
		default:
			throw new TypeError(
				`Unknown tag ${String(object[TAG])} in a stored value`,
			);
	}
	return decodeObject(object);
}

function decodeObject(
	object: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(object)) out[k] = fromJson(v);
	return out;
}
