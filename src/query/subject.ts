import type { Orm } from "../schema/orm.ts";
import {
	type AbstractType,
	ObjectType,
	type ObjectTypeInner,
	OptionType,
	UnionType,
} from "../types";

/** Every key across a union of field maps (union, not the `keyof` intersection). */
type AllKeys<F> = F extends unknown ? keyof F : never;

/** Whether `K` is present in *every* member of the field-map union `F`. */
type PresentInAll<F, K extends PropertyKey> = F extends unknown
	? K extends keyof F
		? true
		: false
	: never;

/** The union of `F[K]` across every member of `F` that defines `K`. */
type Collect<F, K extends PropertyKey> = F extends unknown
	? K extends keyof F
		? F[K]
		: never
	: never;

/**
 * Merge a union of field maps into one: fields present in every member keep
 * their (possibly unioned) type, fields missing from some member become
 * `option<…>`. Mirrors the runtime {@link mergeSchemas}.
 */
export type MergeFields<F extends ObjectTypeInner> = {
	[K in AllKeys<F>]: false extends PresentInAll<F, K>
		? OptionType<Collect<F, K> & AbstractType>
		: Collect<F, K> & AbstractType;
};

/**
 * The row shape a select rooted at `S` exposes. For a single-table schema this
 * is effectively the schema itself (a one-member merge collapses to identity);
 * for a union of member schemas (multi-table / polymorphic-link select) the
 * members are merged into one `ObjectType` via {@link MergeFields}, mirroring
 * the runtime {@link resolveSubjectSchema}.
 *
 * The merge is written as a single, non-distributive `[S] extends
 * [ObjectType<infer F>]` so it stays lazy: an `IsUnion`-style probe would force
 * TypeScript to materialise `this["tables"]` at the `orm.select` call sites,
 * which trips the invariant-`Orm` constraint on the polymorphic `this` type.
 */
export type ResolveEntry<S extends AbstractType> = [S] extends [
	ObjectType<infer F>,
]
	? ObjectType<MergeFields<F>>
	: S;

/**
 * Resolve a query builder's stored table — which is a single table name for an
 * ordinary select, or an array of names for a multi-table / polymorphic-link
 * select (`t.record(["user", "org"])`, `db.select(["user", "company"])`) — into
 * the `ObjectType` that describes a row.
 *
 * For a single table this is just the table's schema. For multiple tables the
 * member schemas are {@link mergeSchemas | merged} into one row type so a single
 * projection callback can reach every field; see {@link mergeSchemas} for how
 * total and partial fields are combined.
 */
export function resolveSubjectSchema(
	orm: Orm,
	tb: string | readonly string[],
): ObjectType {
	const tables = orm.tables as Record<string, { schema: ObjectType }>;
	if (typeof tb === "string") return tables[tb]!.schema;
	return mergeSchemas(tb.map((name) => tables[name]!.schema));
}

/**
 * Merge several table schemas into a single row `ObjectType`:
 * - a field present in **every** member keeps its type — collapsing to a single
 *   type when the members agree, or a {@link UnionType} when they diverge
 *   (e.g. `id` is `RecordId<"user">` on one table and `RecordId<"company">` on
 *   another);
 * - a field present in only **some** members is wrapped in an {@link OptionType}
 *   (`option<…>` → `T | undefined`), because SurrealDB returns `NONE` for that
 *   field on rows whose table does not define it.
 */
export function mergeSchemas(members: ObjectType[]): ObjectType {
	const occurrences = new Map<string, AbstractType[]>();
	for (const member of members) {
		for (const [key, type] of Object.entries(member.schema)) {
			const list = occurrences.get(key);
			if (list) list.push(type);
			else occurrences.set(key, [type]);
		}
	}

	const fields: Record<string, AbstractType> = {};
	for (const [key, types] of occurrences) {
		const distinct = dedupeByExpected(types);
		let type: AbstractType =
			distinct.length === 1 ? distinct[0]! : new UnionType(distinct);
		// Missing from at least one member → optional.
		if (types.length < members.length) type = new OptionType(type);
		fields[key] = type;
	}

	return new ObjectType(fields);
}

/** Collapse types whose `expected` descriptor is identical (e.g. two `string`s). */
function dedupeByExpected(types: AbstractType[]): AbstractType[] {
	const seen = new Set<string>();
	const result: AbstractType[] = [];
	for (const type of types) {
		const key = JSON.stringify(type.expected);
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(type);
	}
	return result;
}
