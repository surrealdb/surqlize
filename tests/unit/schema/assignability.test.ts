import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import {
	type EdgeFields,
	type EdgeSchema,
	edge,
	type TableFields,
	type TableSchema,
	t,
	table,
} from "../../../src";

type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;
type Flat<T> = { [K in keyof T]: T[K] };
const assertType = <_T extends true>() => {};

class Person {
	name!: string;
	shout() {
		return this.name.toUpperCase();
	}
}

const user = table("user", { name: t.string(), age: t.number() });
const withComputed = user.computed("upper", t.string(), (row) =>
	row.name.uppercase(),
);
const person = table("person", { name: t.string() }, Person);
const knows = edge("user", "knows", "user", { since: t.number() });

describe("TableSchema assignability", () => {
	test("a specific table is assignable to every wider table type", () => {
		const bare: TableSchema = user;
		const wide: TableSchema<string, TableFields> = user;
		// biome-ignore lint/suspicious/noExplicitAny: the widest form is part of the contract
		const anyFields: TableSchema<string, any> = user;
		const named: TableSchema<"user", TableFields> = user;
		const computed: TableSchema = withComputed;
		const computedWide: TableSchema<string, TableFields> = withComputed;
		const linked: TableSchema = person;
		// biome-ignore lint/suspicious/noExplicitAny: the widest form is part of the contract
		const linkedWide: TableSchema<string, any, any> = person;
		for (const s of [
			bare,
			wide,
			anyFields,
			named,
			computed,
			computedWide,
			linked,
			linkedWide,
		]) {
			expect(s).toBeDefined();
		}
	});

	test("a specific edge is assignable to a wider edge type", () => {
		const bare: EdgeSchema = knows;
		const wide: EdgeSchema<string, string, string, EdgeFields> = knows;
		expect([bare, wide]).toHaveLength(2);
	});

	test("an unrelated table name is still rejected", () => {
		// @ts-expect-error a table is not assignable to a table of another name
		const other: TableSchema<"post", TableFields> = user;
		expect(other).toBeDefined();
	});
});

describe("inference is unchanged by the widening", () => {
	test("row types", () => {
		assertType<
			Equal<
				(typeof user)["type"],
				{ id: RecordId<"user">; name: string; age: number }
			>
		>();
		assertType<
			Equal<
				(typeof withComputed)["type"],
				{ id: RecordId<"user">; name: string; age: number; upper: string }
			>
		>();
		assertType<Equal<(typeof person)["type"]["name"], string>>();
		assertType<Equal<ReturnType<(typeof person)["type"]["shout"]>, string>>();
		expect(true).toBe(true);
	});

	test("computed callbacks still see the typed row", () => {
		const t2 = user.computed("label", t.string(), (row) => {
			return row.name.concat("!");
		});
		expect(t2.computedFields).toEqual(["label"]);
	});

	test("parse and safeParse results", () => {
		const row = withComputed.parse(
			{ id: new RecordId("user", 1), name: "a", age: 1, upper: "A" },
			{ mode: "row" },
		);
		assertType<
			Equal<
				typeof row,
				{ id: RecordId<"user">; name: string; age: number; upper: string }
			>
		>();
		const created = user.parse({ name: "a", age: 1 });
		assertType<Equal<Flat<typeof created>, { name: string; age: number }>>();
		const updated = user.parse({ age: 1 }, { mode: "update" });
		assertType<
			Equal<
				Flat<typeof updated>,
				{ id?: RecordId<"user">; name?: string; age?: number }
			>
		>();
		const hydrated = person.parse(
			{ id: new RecordId("person", 1), name: "a" },
			{ mode: "row" },
		);
		assertType<Equal<typeof hydrated, (typeof person)["type"]>>();
		expect(created).toEqual({ name: "a", age: 1 });
	});
});
