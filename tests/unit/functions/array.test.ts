import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, orm, t, table } from "../../../src";

describe("Array functions", () => {
	const user = table("user", {
		name: t.string(),
		tags: t.array(t.string()),
		scores: t.array(t.number()),
	});

	const db = orm(new Surreal(), user);

	test("map() generates array::map", () => {
		const query = db.select("user").return((user) => ({
			mapped: user.tags.map((tag) => tag.uppercase()),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("array::map");
		expect(result).toContain("string::uppercase");
		expect(result).toContain("$this.tags");
		expect(result).toContain("|$item, $index|");
		expect(result).toContain("$item");
	});

	test("map() callback item can use string methods", () => {
		const query = db.select("user").return((user) => ({
			lengths: user.tags.map((tag) => tag.len()),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("array::map");
		expect(result).toContain("string::len");
		expect(result).toContain("$item");
		expect(result).toContain("|$item, $index|");
	});

	test("map() exposes the index parameter", () => {
		const query = db.select("user").return((user) => ({
			indexes: user.tags.map((_tag, index) => index),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("array::map");
		expect(result).toContain("$index");
		expect(result).toContain("|$item, $index|");
	});

	test("map() supports object literal callback returns", () => {
		const query = db.select("user").return((user) => ({
			tagDetails: user.tags.map((tag, index) => ({
				index,
				upper: tag.uppercase(),
				length: tag.len(),
			})),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("array::map");
		expect(result).toContain("tagDetails:");
		expect(result).toContain("index: $index");
		expect(result).toContain("upper:");
		expect(result).toContain("length:");
		expect(result).toContain("string::uppercase");
		expect(result).toContain("string::len");
	});

	test("map() works inside a return projection", () => {
		const query = db.select("user").return((user) => ({
			mapped: user.tags.map((tag) => tag.uppercase()),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("SELECT VALUE");
		expect(result).toContain("mapped:");
		expect(result).toContain("array::map");
	});

	test("map() supports numeric array mapping", () => {
		const query = db.select("user").return((user) => ({
			rounded: user.scores.map((score) => score.round()),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("array::map");
		expect(result).toContain("math::round");
		expect(result).toContain("$this.scores");
		expect(result).toContain("$item");
	});
});
