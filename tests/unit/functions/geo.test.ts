import { describe, expect, test } from "bun:test";
import { GeometryPoint, Surreal } from "surrealdb";
import { __display, displayContext, geo, orm, t, table } from "../../../src";

describe("Geo functions", () => {
	const location = table("location", {
		name: t.string(),
		coords: t.string(),
		point: t.point(),
		coordinates: t.array([t.number(), t.number()]),
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
			dist: geo.distance(loc.point, new GeometryPoint([10, 20])),
		}));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toContain("geo::distance");
	});

	test("keeps native points unchanged and binds GeometryPoint values", () => {
		const center = new GeometryPoint([12.5, 41.9]);
		const query = db
			.select("location")
			.where((loc) => geo.distance(loc.point, center).lt(5000));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toBe(
			"(SELECT * FROM $_v0 WHERE geo::distance($this.point, $_v1) < $_v2)",
		);
		expect(ctx.variables._v1).toBe(center);
		expect(ctx.variables._v2).toBe(5000);
	});

	test("casts raw coordinate tuples to points", () => {
		const query = db
			.select("location")
			.where((loc) => geo.distance(loc.point, [12.5, 41.9]).lt(5000));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toBe(
			"(SELECT * FROM $_v0 WHERE geo::distance($this.point, type::point($_v1)) < $_v2)",
		);
		expect(ctx.variables._v1).toEqual([12.5, 41.9]);
	});

	test("casts coordinate expressions and raw tuples to points", () => {
		const query = db
			.select("location")
			.where((loc) => geo.distance(loc.coordinates, [12.5, 41.9]).lt(5000));
		const ctx = displayContext();
		const result = query[__display](ctx);

		expect(result).toBe(
			"(SELECT * FROM $_v0 WHERE geo::distance(type::point($this.coordinates), type::point($_v1)) < $_v2)",
		);
	});

	test("rejects non-coordinate distance arguments at compile time", () => {
		// Coordinates are always [longitude, latitude], never arbitrary arrays.
		// @ts-expect-error A three-number array is not a point tuple.
		geo.distance(db.select("location").wrap(), [1, 2, 3]);
		// @ts-expect-error A one-number array is not a point tuple.
		geo.distance(db.select("location").wrap(), [1]);
		// @ts-expect-error A complete row is not a point expression.
		db.select("location").where((loc) => geo.distance(loc, [1, 2]));
		// @ts-expect-error Raw values need a workable argument to provide context.
		geo.distance(new GeometryPoint([1, 2]), [3, 4]);
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
