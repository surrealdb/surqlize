import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

describe("Filter functions", () => {
	const user = table("user", {
		name: t.string(),
		age: t.number(),
		active: t.bool(),
	});

	const db = orm(new Surreal(), user);

	describe("Comparison operators", () => {
		test("eq() generates equality comparison", () => {
			const query = db.select("user").where(($this) => $this.age.eq(30));
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain("=");
		});

		test("ne() generates inequality comparison", () => {
			const query = db.select("user").where(($this) => $this.age.ne(30));
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain("!=");
		});

		test("lt() generates less than comparison", () => {
			const query = db.select("user").where(($this) => $this.age.lt(30));
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain("<");
		});

		test("lte() generates less than or equal comparison", () => {
			const query = db.select("user").where(($this) => $this.age.lte(30));
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain("<=");
		});

		test("gt() generates greater than comparison", () => {
			const query = db.select("user").where(($this) => $this.age.gt(30));
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain(">");
		});

		test("gte() generates greater than or equal comparison", () => {
			const query = db.select("user").where(($this) => $this.age.gte(30));
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain(">=");
		});
	});

	describe("Logical operators", () => {
		test("and() generates AND condition", () => {
			const query = db
				.select("user")
				.where(($this) => $this.age.gt(18).and($this.age.lt(65)));
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain("AND");
		});

		test("or() generates OR condition", () => {
			const query = db
				.select("user")
				.where(($this) => $this.age.lt(18).or($this.age.gt(65)));
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain("OR");
		});

		test("not() generates NOT condition", () => {
			const query = db
				.select("user")
				.where(($this) => $this.active.eq(true).not());
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain("!");
		});
	});

	describe("Complex conditions", () => {
		test("chains multiple AND conditions", () => {
			const query = db
				.select("user")
				.where(($this) =>
					$this.age.gt(18).and($this.age.lt(65)).and($this.active.eq(true)),
				);
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain("AND");
		});

		test("chains multiple OR conditions", () => {
			const query = db
				.select("user")
				.where(($this) =>
					$this.age.lt(18).or($this.age.gt(65)).or($this.age.eq(30)),
				);
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain("OR");
		});

		test("combines AND and OR conditions", () => {
			const query = db
				.select("user")
				.where(($this) =>
					$this.age.gt(18).and($this.age.lt(65)).or($this.active.eq(true)),
				);
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain("AND");
			expect(result).toContain("OR");
		});
	});

	describe("String comparisons", () => {
		test("generates string equality", () => {
			const query = db.select("user").where(($this) => $this.name.eq("John"));
			const ctx = displayContext();
			const result = query[__display](ctx);

			expect(result).toContain("=");
		});
	});
});
