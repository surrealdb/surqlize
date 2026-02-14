import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

describe("Number functions", () => {
	const user = table("user", {
		age: t.number(),
	});

	const db = orm(new Surreal(), user);

	test("abs() generates math::abs", () => {
		const query = db.select("user").return((user) => ({
			absAge: user.age.abs(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::abs");
	});

	test("ceil() generates math::ceil", () => {
		const query = db.select("user").return((user) => ({
			ceilAge: user.age.ceil(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::ceil");
	});

	test("floor() generates math::floor", () => {
		const query = db.select("user").return((user) => ({
			floorAge: user.age.floor(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::floor");
	});

	test("round() generates math::round", () => {
		const query = db.select("user").return((user) => ({
			roundAge: user.age.round(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::round");
	});

	test("fixed(2) generates math::fixed", () => {
		const query = db.select("user").return((user) => ({
			fixedAge: user.age.fixed(2),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::fixed");
	});

	test("sign() generates math::sign", () => {
		const query = db.select("user").return((user) => ({
			signAge: user.age.sign(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::sign");
	});

	test("sqrt() generates math::sqrt", () => {
		const query = db.select("user").return((user) => ({
			sqrtAge: user.age.sqrt(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::sqrt");
	});

	test("pow(2) generates math::pow", () => {
		const query = db.select("user").return((user) => ({
			powAge: user.age.pow(2),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::pow");
	});

	test("cos() generates math::cos", () => {
		const query = db.select("user").return((user) => ({
			cosAge: user.age.cos(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::cos");
	});

	test("sin() generates math::sin", () => {
		const query = db.select("user").return((user) => ({
			sinAge: user.age.sin(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::sin");
	});

	test("tan() generates math::tan", () => {
		const query = db.select("user").return((user) => ({
			tanAge: user.age.tan(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::tan");
	});

	test("ln() generates math::ln", () => {
		const query = db.select("user").return((user) => ({
			lnAge: user.age.ln(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::ln");
	});

	test("log(10) generates math::log", () => {
		const query = db.select("user").return((user) => ({
			logAge: user.age.log(10),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::log");
	});

	test("log10() generates math::log10", () => {
		const query = db.select("user").return((user) => ({
			log10Age: user.age.log10(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::log10");
	});

	test("log2() generates math::log2", () => {
		const query = db.select("user").return((user) => ({
			log2Age: user.age.log2(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::log2");
	});

	test("deg2rad() generates math::deg2rad", () => {
		const query = db.select("user").return((user) => ({
			radAge: user.age.deg2rad(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::deg2rad");
	});

	test("rad2deg() generates math::rad2deg", () => {
		const query = db.select("user").return((user) => ({
			degAge: user.age.rad2deg(),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::rad2deg");
	});

	test("clamp(0, 100) generates math::clamp", () => {
		const query = db.select("user").return((user) => ({
			clampedAge: user.age.clamp(0, 100),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("math::clamp");
	});
});
