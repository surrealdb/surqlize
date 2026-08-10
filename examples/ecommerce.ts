/**
 * An online store.
 *
 * A sequence for order numbers, events that adjust stock as orders move
 * through their states, and per-operation table permissions.
 *
 *   bun sur plan    --schema examples/ecommerce.ts
 *   bun sur migrate --schema examples/ecommerce.ts
 */
import { analyzer, sequence, t, table } from "../src";

export const english = analyzer("english", {
	tokenizers: ["blank", "class"],
	filters: ["lowercase", "ascii", "snowball(english)"],
});

/** Order numbers start well above zero so they do not look like test data. */
export const orderNumber = sequence("order_number", { start: 10000 });

export const category = table("category", {
	name: t.string().assert("$value != NONE"),
	slug: t.string().assert("$value != NONE"),
	description: t.option(t.string()),
	parent: t.option(t.record("category")),
	sortOrder: t.int().default(0),
	isActive: t.bool().default(true),
})
	.index("category_slug", { fields: ["slug"], unique: true })
	.index("category_parent", { fields: ["parent", "sortOrder"] });

export const product = table("product", {
	sku: t.string().assert("$value != NONE"),
	name: t.string().assert("$value != NONE"),
	slug: t.string().assert("$value != NONE"),
	description: t.string().assert("$value != NONE"),
	price: t.decimal().assert("$value != NONE").assert("$value >= 0"),
	comparePrice: t.option(t.decimal()),
	category: t.record("category").assert("$value != NONE"),
	images: t.array(t.string()).default([]),
	stock: t.int().default(0).assert("$value >= 0"),
	lowStockThreshold: t.int().default(5),
	isActive: t.bool().default(true),
	isFeatured: t.bool().default(false),
	weight: t.option(t.float()),
	// Free-form, so flexible rather than a declared shape.
	dimensions: t.option(t.object({}).flexible()),
	metadata: t.option(t.object({}).flexible()),
	createdAt: t.date().default("time::now()"),
	updatedAt: t.date().valueExpr("time::now()"),
})
	.index("product_sku", { fields: ["sku"], unique: true })
	.index("product_slug", { fields: ["slug"], unique: true })
	.index("product_category", { fields: ["category", "isActive"] })
	.index("product_featured", { fields: ["isFeatured", "createdAt"] })
	.index("product_search", {
		fields: ["name"],
		fulltext: { analyzer: "english" },
	})
	.event("low_stock_alert", {
		on: "UPDATE",
		when: "$before.stock > $after.lowStockThreshold AND $after.stock <= $after.lowStockThreshold",
		body: `CREATE notification SET
			type = 'low_stock',
			product = $after.id,
			message = string::concat('Low stock alert: ', $after.name),
			createdAt = time::now()`,
	});

export const customer = table("customer", {
	email: t.string().assert("$value != NONE").assert("string::is_email($value)"),
	name: t.string().assert("$value != NONE"),
	phone: t.option(t.string()),
	defaultAddress: t.option(t.object({}).flexible()),
	addresses: t.array(t.object({}).flexible()).default([]),
	orderCount: t.int().default(0),
	totalSpent: t.decimal().default(0),
	createdAt: t.date().default("time::now()"),
	updatedAt: t.date().valueExpr("time::now()"),
}).index("customer_email", { fields: ["email"], unique: true });

export const order = table("order", {
	orderNumber: t.int().default("sequence::nextval('order_number')"),
	customer: t.record("customer").assert("$value != NONE"),
	/** Each entry is `{ product, quantity, price }`. */
	items: t.array(t.object({}).flexible()).assert("$value != NONE"),
	subtotal: t.decimal().assert("$value != NONE"),
	tax: t.decimal().default(0),
	shipping: t.decimal().default(0),
	total: t.decimal().assert("$value != NONE"),
	status: t.string().default("pending"),
	shippingAddress: t.object({}).flexible().assert("$value != NONE"),
	billingAddress: t.option(t.object({}).flexible()),
	notes: t.option(t.string()),
	createdAt: t.date().default("time::now()"),
	updatedAt: t.date().valueExpr("time::now()"),
	completedAt: t.option(t.date()),
})
	.permissions({
		select: "$auth.id = customer OR $auth.role = 'admin'",
		create: "$auth.id != NONE",
		update: "$auth.role = 'admin'",
		delete: "NONE",
	})
	.index("order_number", { fields: ["orderNumber"], unique: true })
	.index("order_customer", { fields: ["customer", "createdAt"] })
	.index("order_status", { fields: ["status", "createdAt"] })
	.event("update_inventory", {
		on: "CREATE",
		body: `{
			FOR $item IN $after.items {
				UPDATE product SET stock -= $item.quantity WHERE id = $item.product;
			};
		}`,
	})
	.event("on_complete", {
		on: "UPDATE",
		when: "$before.status != 'completed' AND $after.status = 'completed'",
		body: `{
			UPDATE $after.id SET completedAt = time::now();
			UPDATE $after.customer SET orderCount += 1, totalSpent += $after.total;
		}`,
	})
	.event("restore_inventory", {
		on: "UPDATE",
		when: "$after.status = 'cancelled' AND $before.status != 'cancelled'",
		body: `{
			FOR $item IN $after.items {
				UPDATE product SET stock += $item.quantity WHERE id = $item.product;
			};
		}`,
	});

export default [english, orderNumber, category, product, customer, order];
