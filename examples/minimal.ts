/**
 * The smallest useful schema.
 *
 * One table, a couple of constraints, a default and a timestamp. Enough to run
 * a first migration against.
 *
 *   bun sur plan    --schema examples/minimal.ts
 *   bun sur migrate --schema examples/minimal.ts
 */
import { t, table } from "../src";

export const task = table("task", {
	title: t
		.string()
		.assert("$value != NONE")
		.assert("string::len($value) >= 1 AND string::len($value) <= 200"),
	description: t.string(),
	completed: t.bool().default(false),
	createdAt: t.date().valueExpr("time::now()"),
});

export default [task];
