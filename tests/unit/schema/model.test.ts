import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import { orm, t, table } from "../../../src";

type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;

class User {
	given_name!: string;
	family_name!: string;

	get fullName() {
		return `${this.given_name} ${this.family_name}`;
	}

	greet(other: string) {
		return `${this.given_name} greets ${other}`;
	}
}

const fields = { given_name: t.string(), family_name: t.string() };
const user = table("user", fields, User);

describe("table() linked to a class", () => {
	test("parses rows into instances of the class", () => {
		const row = user.schema.parse({
			id: new RecordId("user", "a"),
			given_name: "Ada",
			family_name: "Lovelace",
		});

		expect(row).toBeInstanceOf(User);
		expect(row.fullName).toBe("Ada Lovelace");
		expect(row.greet("Bob")).toBe("Ada greets Bob");
		expect(row.id.id).toBe("a");
		expect(Object.keys(row).sort()).toEqual([
			"family_name",
			"given_name",
			"id",
		]);
	});

	test("does not run the class constructor", () => {
		let calls = 0;
		class Tracked {
			constructor() {
				calls++;
			}
		}
		const tracked = table("tracked", { a: t.string() }, Tracked);
		tracked.schema.parse({ id: new RecordId("tracked", 1), a: "x" });
		expect(calls).toBe(0);
	});

	test("still validates fields", () => {
		expect(() =>
			user.schema.parse({ id: new RecordId("user", "a"), given_name: 1 }),
		).toThrow();
	});

	test("tables without a class are unchanged", () => {
		const plain = table("plain", fields);
		const row = plain.schema.parse({
			id: new RecordId("plain", "a"),
			given_name: "A",
			family_name: "B",
		});
		expect(row).not.toBeInstanceOf(User);
		expect(Object.getPrototypeOf(row)).toBe(Object.prototype);
	});

	test("hydrates select results through the orm", () => {
		const db = orm(new Surreal(), user);
		const [row] = db
			.select("user")
			.parse([
				{ id: new RecordId("user", "a"), given_name: "A", family_name: "B" },
			]);
		expect(row).toBeInstanceOf(User);
	});

	test("binds class instances as plain objects", () => {
		const db = orm(new Surreal(), user);
		const instance = Object.assign(new User(), {
			given_name: "Ada",
			family_name: "Lovelace",
		});

		const bound = db.create("user").content(instance).prepare().bindings;
		const value = (bound as Record<string, object>)._v1 as object;
		expect(value).not.toBeInstanceOf(User);
		expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
		expect(value).toEqual({ given_name: "Ada", family_name: "Lovelace" });
	});
});

describe("table() linked to a class: types", () => {
	test("infers the row fields together with the class instance", () => {
		type Row = (typeof user)["type"];
		const _fields: Equal<Row["given_name"], string> = true;
		const _getter: Equal<Row["fullName"], string> = true;
		const _method: Equal<Row["greet"], (other: string) => string> = true;
		const _id: Equal<Row["id"], RecordId<"user">> = true;
		expect([_fields, _getter, _method, _id]).toEqual([true, true, true, true]);
	});

	test("select results are typed as instances", () => {
		const db = orm(new Surreal(), user);
		const q = db.select("user");
		type Row = (typeof q)["type"][number];
		const _getter: Equal<Row["fullName"], string> = true;
		const _field: Equal<Row["family_name"], string> = true;
		expect([_getter, _field]).toEqual([true, true]);

		// Projections define their own shape and are not instances.
		const p = db.select("user").return((u) => ({ n: u.given_name }));
		type Proj = (typeof p)["type"][number];
		const _proj: Equal<Proj, { n: string }> = true;
		expect(_proj).toBe(true);
	});

	test("tables without a class do not gain extra members", () => {
		const plain = table("plain", fields);
		type Row = (typeof plain)["type"];
		const _row: Equal<
			Row,
			{ given_name: string; family_name: string; id: RecordId<"plain"> }
		> = true;
		expect(_row).toBe(true);
	});

	test("rejects a non-class third argument", () => {
		// @ts-expect-error not a class
		table("bad", fields, { not: "a class" });
	});
	test("parse and safeParse in row mode hydrate instances", () => {
		const raw = {
			id: new RecordId("user", "a"),
			given_name: "Ada",
			family_name: "Lovelace",
		};

		const parsed = user.parse(raw, { mode: "row" });
		expect(parsed).toBeInstanceOf(User);
		expect(parsed.fullName).toBe("Ada Lovelace");
		expect(parsed.id.id).toBe("a");

		const safe = user.safeParse(raw, { mode: "row" });
		expect(safe.success).toBe(true);
		if (safe.success) {
			expect(safe.data).toBeInstanceOf(User);
			expect(safe.data.greet("Bob")).toBe("Ada greets Bob");
		}

		// The input is left untouched, and invalid rows still fail.
		expect(raw).not.toBeInstanceOf(User);
		expect(
			user.safeParse({ ...raw, given_name: 1 }, { mode: "row" }).success,
		).toBe(false);
	});

	test("create and update modes return the data as given", () => {
		const input = { given_name: "Ada", family_name: "Lovelace" };
		expect(user.parse(input)).toBe(input);
		expect(user.parse(input, { mode: "update" })).toBe(input);
	});
});
