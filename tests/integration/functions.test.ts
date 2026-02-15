import { describe, expect, test } from "bun:test";
import { fn, TypeParseError, t } from "../../src";
import { withTestDb } from "./setup";

describe("User-defined function integration tests", () => {
	const getTestDb = withTestDb({ perTest: true });

	describe("db.run()", () => {
		test("runs a function with a single argument", async () => {
			const { db, surreal } = getTestDb();

			// Define the function in SurrealDB
			await surreal.query(`
				DEFINE FUNCTION fn::greet($name: string) {
					RETURN "Hello, " + $name;
				};
			`);

			const greet = fn("greet", [t.string()], t.string());
			const result = await db.run(greet, ["world"]);

			expect(result).toBe("Hello, world");
		});

		test("runs a function with multiple arguments", async () => {
			const { db, surreal } = getTestDb();

			await surreal.query(`
				DEFINE FUNCTION fn::add($a: number, $b: number) {
					RETURN $a + $b;
				};
			`);

			const add = fn("add", [t.number(), t.number()], t.number());
			const result = await db.run(add, [3, 7]);

			expect(result).toBe(10);
		});

		test("runs a function with no arguments", async () => {
			const { db, surreal } = getTestDb();

			await surreal.query(`
				DEFINE FUNCTION fn::get_pi() {
					RETURN 3.14;
				};
			`);

			const getPi = fn("get_pi", [], t.number());
			const result = await db.run(getPi);

			expect(result).toBe(3.14);
		});

		test("runs a function that returns an object", async () => {
			const { db, surreal } = getTestDb();

			await surreal.query(`
				DEFINE FUNCTION fn::make_pair($key: string, $val: string) {
					RETURN { key: $key, val: $val };
				};
			`);

			const makePair = fn(
				"make_pair",
				[t.string(), t.string()],
				t.object({ key: t.string(), val: t.string() }),
			);

			const result = await db.run(makePair, ["name", "Alice"]);

			expect(result.key).toBe("name");
			expect(result.val).toBe("Alice");
		});
	});

	describe("fn() in queries", () => {
		test("uses a function in a return projection", async () => {
			const { db, surreal } = getTestDb();

			await surreal.query(`
				DEFINE FUNCTION fn::shout($text: string) {
					RETURN string::uppercase($text);
				};

				CREATE user:alice SET
					name = { first: "Alice", last: "Smith" },
					age = 30,
					email = "alice@example.com",
					created = time::now(),
					updated = time::now();
			`);

			const shout = fn("shout", [t.string()], t.string());

			const result = await db
				.select("user")
				.return((u) => ({
					loud_email: shout(u, u.email),
				}))
				.execute();

			expect(result).toHaveLength(1);
			expect(result[0]!.loud_email).toBe("ALICE@EXAMPLE.COM");
		});

		test("uses a function in a WHERE clause to filter results", async () => {
			const { db, surreal } = getTestDb();

			await surreal.query(`
				DEFINE FUNCTION fn::is_adult($age: number) {
					RETURN $age >= 18;
				};

				CREATE user:alice SET
					name = { first: "Alice", last: "Smith" },
					age = 30,
					email = "alice@example.com",
					created = time::now(),
					updated = time::now();

				CREATE user:bob SET
					name = { first: "Bob", last: "Jones" },
					age = 12,
					email = "bob@example.com",
					created = time::now(),
					updated = time::now();

				CREATE user:charlie SET
					name = { first: "Charlie", last: "Brown" },
					age = 25,
					email = "charlie@example.com",
					created = time::now(),
					updated = time::now();
			`);

			const isAdult = fn("is_adult", [t.number()], t.bool());

			const result = await db
				.select("user")
				.where((u) => isAdult(u, u.age))
				.execute();

			expect(result).toHaveLength(2);
			const names = result.map((r) => r.name.first).sort();
			expect(names).toEqual(["Alice", "Charlie"]);
		});
	});

	describe("db.run() in transactions", () => {
		test("runs a function inside a transaction", async () => {
			const { db, surreal } = getTestDb();

			await surreal.query(`
				DEFINE FUNCTION fn::greet($name: string) {
					RETURN "Hello, " + $name;
				};
			`);

			const greet = fn("greet", [t.string()], t.string());

			const result = await db.transaction(async (tx) => {
				return tx.run(greet, ["world"]);
			});

			expect(result).toBe("Hello, world");
		});
	});

	describe("db.run() error handling", () => {
		test("throws TypeParseError when return type does not match schema", async () => {
			const { db, surreal } = getTestDb();

			// Function returns a string, but we declare the schema as t.number()
			await surreal.query(`
				DEFINE FUNCTION fn::returns_string() {
					RETURN "i am a string";
				};
			`);

			const wrongType = fn("returns_string", [], t.number());

			try {
				await db.run(wrongType);
				// Should not reach here
				expect(true).toBe(false);
			} catch (err) {
				expect(err).toBeInstanceOf(TypeParseError);
			}
		});
	});
});
