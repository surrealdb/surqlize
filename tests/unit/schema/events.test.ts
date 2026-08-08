import { describe, expect, test } from "bun:test";
import { t, table } from "../../../src";
import { defineSchema } from "../../../src/schema/ddl/define";
import { defineEvent } from "../../../src/schema/ddl/event-ddl";

/**
 * When an event fires, and how its body is wrapped.
 *
 * SurrealDB needs a multi-statement body in a block, so a body is wrapped only
 * when it needs to be — wrapping a bare expression would change what `THEN`
 * returns, and not wrapping several statements is a parse error.
 */

/** Just the `THEN` clause. */
function then(body: string): string {
	const sql = defineEvent("t", { name: "e", on: "CREATE", body });

	return sql.slice(sql.indexOf("THEN ") + 5, -1);
}

describe("Body wrapping", () => {
	test("a single statement is left bare", () => {
		expect(then("UPDATE $after SET seen = true")).toBe(
			"UPDATE $after SET seen = true",
		);
	});

	test("several statements are wrapped in a block", () => {
		const body = "LET $x = 1; UPDATE $after SET n = $x;";

		expect(then(body)).toBe(`{ ${body} }`);
	});

	test("an already-braced body is not wrapped twice", () => {
		expect(then("{ RETURN 1; }")).toBe("{ RETURN 1; }");
	});

	test("empty braces are left alone", () => {
		expect(then("{ }")).toBe("{ }");
	});

	test("a FOR loop is wrapped even without a semicolon", () => {
		expect(then("FOR $x IN [1, 2] { RETURN $x }")).toStartWith("{ FOR");
	});

	test("an IF is wrapped even without a semicolon", () => {
		expect(then("IF $after.flag { RETURN 1 }")).toStartWith("{ IF");
	});

	test("a LET is wrapped even without a semicolon", () => {
		expect(then("LET $x = 1")).toBe("{ LET $x = 1 }");
	});

	test("surrounding whitespace is trimmed", () => {
		expect(then("  RETURN 1  ")).toBe("RETURN 1");
	});
});

describe("Bodies that are easy to mangle", () => {
	test("nested braces survive intact", () => {
		const body = `{
			IF $after.type = 'premium' {
				IF $after.verified {
					UPDATE $after.id SET tier = 'gold';
				} ELSE {
					UPDATE $after.id SET tier = 'silver';
				};
			};
		}`;

		const sql = then(body);

		expect(sql).toContain("tier = 'gold'");
		expect(sql).toContain("tier = 'silver'");
		expect(sql.startsWith("{")).toBe(true);
		expect(sql.endsWith("}")).toBe(true);
	});

	test("a semicolon inside a string literal is not a statement break", () => {
		const body = "{ CREATE log SET message = 'Done; next pending'; }";

		expect(then(body)).toContain("Done; next pending");
	});

	test("every statement of a cleanup body survives", () => {
		const body = `{
			DELETE notification WHERE recipient = $before.id;
			DELETE follow WHERE in = $before.id OR out = $before.id;
			UPDATE stats SET userCount -= 1;
		}`;

		const sql = defineEvent("user", { name: "cleanup", on: "DELETE", body });

		expect(sql).toContain('WHEN $event = "DELETE"');
		expect(sql).toContain("DELETE notification");
		expect(sql).toContain("DELETE follow");
		expect(sql).toContain("UPDATE stats");
	});
});

describe("Triggers", () => {
	test("each operation guards on itself", () => {
		for (const op of ["CREATE", "UPDATE", "DELETE"] as const) {
			expect(
				defineEvent("t", { name: "e", on: op, body: "RETURN 1" }),
			).toContain(`WHEN $event = "${op}"`);
		}
	});

	test("a condition alone fires on any operation matching it", () => {
		expect(
			defineEvent("t", { name: "e", when: "$after.flag", body: "RETURN 1" }),
		).toContain("WHEN $after.flag");
	});

	test("a comment comes after the body", () => {
		expect(
			defineEvent("t", { name: "e", body: "RETURN 1", comment: "Note" }),
		).toEndWith("COMMENT 'Note';");
	});
});

describe("Events on a schema", () => {
	test("several events are all emitted", () => {
		const user = table("user", { name: t.string() })
			.event("on_create", {
				on: "CREATE",
				body: "CREATE audit SET at = time::now()",
			})
			.event("on_delete", {
				on: "DELETE",
				body: "DELETE session WHERE user = $before.id",
			});

		const events = defineSchema(user).filter((s) =>
			s.startsWith("DEFINE EVENT"),
		);

		expect(events).toHaveLength(2);
		expect(events[0]).toContain("on_create");
		expect(events[1]).toContain("on_delete");
	});
});
