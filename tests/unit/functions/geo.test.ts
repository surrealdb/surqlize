import { describe, expect, test } from "bun:test";
import { Surreal } from "surrealdb";
import { __display, displayContext, geo, orm, t, table } from "../../../src";

describe("Geo functions", () => {
	const location = table("location", {
		name: t.string(),
		coords: t.string(),
		area: t.string(),
	});

	const db = orm(new Surreal(), location);

	test("geo.area() generates geo::area", () => {
		const query = db.select("location").return((loc) => ({
			size: geo.area(loc.area),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("geo::area");
	});

	test("geo.bearing() generates geo::bearing", () => {
		const query = db.select("location").return((loc) => ({
			bearing: geo.bearing(loc.coords, loc.coords),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("geo::bearing");
	});

	test("geo.centroid() generates geo::centroid", () => {
		const query = db.select("location").return((loc) => ({
			center: geo.centroid(loc.area),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("geo::centroid");
	});

	test("geo.distance() generates geo::distance", () => {
		const query = db.select("location").return((loc) => ({
			dist: geo.distance(loc.coords, loc.coords),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("geo::distance");
	});

	test("geo.hashDecode() generates geo::hash::decode", () => {
		const query = db.select("location").return((loc) => ({
			decoded: geo.hashDecode(loc.coords),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("geo::hash::decode");
	});

	test("geo.hashEncode() generates geo::hash::encode", () => {
		const query = db.select("location").return((loc) => ({
			hash: geo.hashEncode(loc.coords),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("geo::hash::encode");
	});
});
