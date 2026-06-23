import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import { __display, and, displayContext, orm, t, table } from "../../../src";

const designer = table("designer", { name: t.string() });

const product = table("product", {
	designer: t.record("designer"),
	created_at: t.date(),
});

const variant = table("variant", {
	base_product: t.record("product"),
	// a multi-table record link; both members share `firstName`
	reviewer: t.record(["user", "admin"]),
});

const user = table("user", {
	firstName: t.string(),
	lastName: t.string(),
	age: t.number(),
});

const admin = table("admin", {
	firstName: t.string(),
	level: t.number(),
});

const checkout = table("checkout", {
	products: t.array(t.object({ created_at: t.date(), qty: t.number() })),
	links: t.array(t.record("product")),
	coupons: t.option(t.array(t.string())),
	owner: t.option(t.record("designer")),
	note: t.option(t.string()),
});

const db = orm(
	new Surreal(),
	designer,
	product,
	variant,
	user,
	admin,
	checkout,
);

function render(query: {
	[__display]: (ctx: ReturnType<typeof displayContext>) => string;
}) {
	return query[__display](displayContext());
}

// ─── #37 — nested field access through record links ─────────────────────────

describe("#37 record-link field access in .where", () => {
	test("resolves a single-table link field and renders a dotted path", () => {
		const query = db
			.select("variant")
			.where((v) => v.base_product.designer.eq(new RecordId("designer", "x")));

		expect(render(query)).toContain("$this.base_product.designer =");
	});

	test("chains through two links (variant → product → designer → name)", () => {
		const query = db
			.select("variant")
			.where((v) => v.base_product.designer.name.eq("Ada"));

		expect(render(query)).toContain("$this.base_product.designer.name =");
	});

	test("resolves a field shared across a multi-table link", () => {
		const query = db
			.select("variant")
			.where((v) => v.reviewer.firstName.eq("Grace"));

		expect(render(query)).toContain("$this.reviewer.firstName =");
	});
});

// ─── #36 — array element / nested access in .where ───────────────────────────

describe("#36 array element access in .where", () => {
	test("bracket index then nested object field", () => {
		// bracket access is `T | undefined` under noUncheckedIndexedAccess, hence `!`
		const query = db
			.select("checkout")
			.where((c) => c.products[0]!.created_at.lt(new Date(0)));

		expect(render(query)).toContain("$this.products[0].created_at <");
	});

	test(".at(index) then nested object field resolves against the element", () => {
		const query = db
			.select("checkout")
			.where((c) => c.products.at(0).created_at.lt(new Date(0)));

		const sql = render(query);
		expect(sql).toContain("array::at($this.products,");
		expect(sql).toContain(").created_at <");
	});

	test(".len() renders array::len", () => {
		const query = db.select("checkout").where((c) => c.products.len().gt(2));

		expect(render(query)).toContain("array::len($this.products) >");
	});

	test("array of record links: index then link field (#36 × #37)", () => {
		const query = db
			.select("checkout")
			.where((c) => c.links[0]!.designer.eq(new RecordId("designer", "y")));

		expect(render(query)).toContain("$this.links[0].designer =");
	});

	test("combines element conditions with and()", () => {
		const query = db
			.select("checkout")
			.where((c) =>
				and(
					c.products[0]!.created_at.lt(new Date(0)),
					c.products.at(0).qty.gt(1),
				),
			);

		const sql = render(query);
		expect(sql).toContain("$this.products[0].created_at <");
		expect(sql).toContain(".qty >");
	});
});

// ─── option<T> accessors: unwrap / isNone / isSome ───────────────────────────

describe("option<T> methods", () => {
	test("unwrap() exposes inner array methods (identity on the path)", () => {
		const query = db
			.select("checkout")
			.where((c) => c.coupons.unwrap().at(0).eq("SAVE"));

		expect(render(query)).toContain("array::at($this.coupons,");
	});

	test("unwrap() exposes inner record-link fields", () => {
		const query = db
			.select("checkout")
			.where((c) => c.owner.unwrap().name.eq("Ada"));

		expect(render(query)).toContain("$this.owner.name =");
	});

	test("unwrapOr(fallback) renders the ?? coalescing operator", () => {
		const query = db
			.select("checkout")
			.where((c) => c.note.unwrapOr("n/a").eq("x"));

		expect(render(query)).toContain("($this.note ?? ");
	});

	test("isNone() renders IS NONE", () => {
		const query = db.select("checkout").where((c) => c.note.isNone());
		expect(render(query)).toContain("$this.note IS NONE");
	});

	test("isSome() renders IS NOT NONE", () => {
		const query = db.select("checkout").where((c) => c.coupons.isSome());
		expect(render(query)).toContain("$this.coupons IS NOT NONE");
	});

	test("isSomeAnd(cb) guards presence then applies the predicate", () => {
		const query = db
			.select("checkout")
			.where((c) => c.coupons.isSomeAnd((cs) => cs.len().gt(0)));

		const sql = render(query);
		expect(sql).toContain("$this.coupons IS NOT NONE AND");
		expect(sql).toContain("array::len($this.coupons) >");
	});
});
