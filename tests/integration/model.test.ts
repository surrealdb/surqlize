import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { orm, t, table } from "../../src";

class Person {
	given_name!: string;
	family_name!: string;

	get fullName() {
		return `${this.given_name} ${this.family_name}`;
	}
}

class Pet {
	name!: string;
	owner!: Person;

	shout() {
		return `${this.name.toUpperCase()}!`;
	}
}

const person = table(
	"person",
	{ given_name: t.string(), family_name: t.string() },
	Person,
);
const pet = table("pet", { name: t.string(), owner: t.record("person") }, Pet);

describe("table linked to a class (integration)", () => {
	const surreal = new Surreal();
	const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
	const namespace = `test_model_${suffix}`;
	const database = `db_model_${suffix}`;
	const db = orm(surreal, person, pet);

	beforeAll(async () => {
		await surreal.connect(process.env.SURREAL_URL || "ws://localhost:8000");
		await surreal.signin({ username: "root", password: "root" });
		await surreal.query(`DEFINE NAMESPACE IF NOT EXISTS ${namespace}`);
		await surreal.use({ namespace });
		await surreal.query(`DEFINE DATABASE IF NOT EXISTS ${database}`);
		await surreal.use({ namespace, database });
	});

	afterAll(async () => {
		await surreal.query(`REMOVE NAMESPACE ${namespace}`);
		await surreal.close();
	});

	test("create accepts an instance and returns an instance", async () => {
		const input = Object.assign(new Person(), {
			given_name: "Ada",
			family_name: "Lovelace",
		});

		const [created] = await db.create("person", "ada").content(input);

		expect(created).toBeInstanceOf(Person);
		expect(created!.fullName).toBe("Ada Lovelace");
	});

	test("select hydrates rows into instances", async () => {
		const people = await db.select("person");
		expect(people).toHaveLength(1);
		expect(people[0]).toBeInstanceOf(Person);
		expect(people[0]!.fullName).toBe("Ada Lovelace");

		const one = await db.select("person", "ada").only();
		expect(one).toBeInstanceOf(Person);
	});

	test("insert accepts instances", async () => {
		const grace = Object.assign(new Person(), {
			given_name: "Grace",
			family_name: "Hopper",
		});
		const rows = await db.insert("person", [grace]);
		expect(rows[0]).toBeInstanceOf(Person);
		expect(rows[0]!.fullName).toBe("Grace Hopper");
	});

	test("update returns instances", async () => {
		const [updated] = await db
			.update("person", "ada")
			.set({ given_name: "Augusta" });
		expect(updated).toBeInstanceOf(Person);
		expect(updated!.fullName).toBe("Augusta Lovelace");
	});

	test("fetched links are hydrated with their own class", async () => {
		await surreal.query(`CREATE pet:rex SET name = "rex", owner = person:ada`);
		const [rex] = await db.select("pet").fetch("owner");
		expect(rex).toBeInstanceOf(Pet);
		expect(rex!.shout()).toBe("REX!");
		expect(rex!.owner).toBeInstanceOf(Person);
		expect(rex!.owner.fullName).toBe("Augusta Lovelace");
	});

	test("projections are plain objects", async () => {
		const [row] = await db
			.select("person", "ada")
			.return((p) => ({ n: p.given_name }));
		expect(row).toEqual({ n: "Augusta" });
		expect(row).not.toBeInstanceOf(Person);
	});
});
