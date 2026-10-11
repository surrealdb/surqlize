import { describe, expect, test } from "bun:test";
import { RecordId, Surreal } from "surrealdb";
import {
	and,
	authenticatedAs,
	edge,
	generateSchema,
	not,
	or,
	orm,
	t,
	table,
	where,
} from "../../../src";
import {
	defineField,
	defineSchema,
	defineTable,
} from "../../../src/schema/ddl/define";
import { flattenFields } from "../../../src/schema/ddl/flatten";

/** Render one field of a table, by name. */
function field(schema: Parameters<typeof defineSchema>[0], name: string) {
	const found = flattenFields(schema.fields).find((f) => f.name === name);
	if (!found) throw new Error(`No field ${name}`);
	return defineField(schema.tb, found, { tables: { [schema.tb]: schema } });
}

const user = table("user", { role: t.string(), name: t.string() });

describe("typed table permissions", () => {
	test("the four operations, with keywords and conditions", () => {
		const post = table("post", {
			title: t.string(),
			owner: t.record("user"),
		}).permissions({
			select: "full",
			create: where((_row, { auth }) => auth.id.ne(undefined)),
			update: where((row, { auth }) => row.owner.eq(auth.id)),
			delete: "none",
		});

		expect(defineTable(post)).toBe(
			"DEFINE TABLE post TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select FULL, FOR create WHERE $auth.id != NONE, FOR update WHERE $this.owner = $auth.id, FOR delete NONE;",
		);
	});

	test("keywords are accepted in either case", () => {
		expect(
			defineTable(
				table("t", {}).permissions({ select: "FULL", create: "none" }),
			),
		).toContain("PERMISSIONS FOR select FULL, FOR create NONE");
	});

	test("an operation left out is left out of the clause", () => {
		const sql = defineTable(
			table("t", { n: t.int() }).permissions({
				update: where((row) => row.n.gt(1)),
			}),
		);
		expect(sql).toContain("PERMISSIONS FOR update WHERE $this.n > 1;");
	});

	test("typed and string rules mix", () => {
		const sql = defineTable(
			table("t", { n: t.int() }).permissions({
				select: "$auth.id != NONE",
				update: where((row) => row.n.gt(1)),
				create: "WHERE $auth",
			}),
		);
		expect(sql).toContain(
			"FOR select WHERE $auth.id != NONE, FOR update WHERE $this.n > 1, FOR create WHERE $auth",
		);
	});

	test("an empty set of rules renders no clause", () => {
		expect(defineTable(table("t", {}).permissions({}))).toBe(
			"DEFINE TABLE t TYPE NORMAL SCHEMAFULL;",
		);
	});

	test("an edge takes typed rules over in, out and its own fields", () => {
		const wrote = edge("user", "wrote", "post", { n: t.int() }).permissions({
			select: where((row, { auth }) => row.in.eq(auth.id)),
			update: where((row) => row.n.gt(0)),
			delete: "none",
		});

		expect(defineTable(wrote)).toBe(
			"DEFINE TABLE wrote TYPE RELATION IN user OUT post SCHEMAFULL PERMISSIONS FOR select WHERE $this.in = $auth.id, FOR update WHERE $this.n > 0, FOR delete NONE;",
		);
	});

	test("the string forms are unchanged", () => {
		expect(defineTable(table("t", {}).permissions("NONE"))).toBe(
			"DEFINE TABLE t TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;",
		);
		expect(
			defineTable(
				table("t", {}).permissions({
					select: "$auth.id = customer",
					update: "FULL",
				}),
			),
		).toBe(
			"DEFINE TABLE t TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select WHERE $auth.id = customer, FOR update FULL;",
		);
	});

	test("tables are not changed by permissions()", () => {
		const base = table("t", { n: t.int() });
		const guarded = base.permissions({ select: "full" });
		expect(base.ddl.permissions).toBeUndefined();
		expect(guarded.ddl.permissions).toEqual({ select: "full" });
	});

	test("a rule reading a field-only variable is refused", () => {
		const bad = table("t", {}).permissions({
			select: where((_row, { value }) => value.eq(1)),
		});
		expect(() => defineTable(bad)).toThrow(
			"$value is not available in the permissions of a table",
		);
	});
});

describe("typed field permissions", () => {
	test("one rule per operation", () => {
		const post = table("post", {
			owner: t.record("user"),
			secret: t.string().permissions({
				select: where((row, { auth }) => row.owner.eq(auth.id)),
				create: "full",
				update: where((_row, { value }) => value.ne("x")),
			}),
		});

		expect(field(post, "secret")).toBe(
			"DEFINE FIELD secret ON TABLE post TYPE string PERMISSIONS FOR select WHERE $this.owner = $auth.id, FOR create FULL, FOR update WHERE $value != 'x';",
		);
	});

	test("the value before and after a write", () => {
		const post = table("post", {
			n: t.int().permissions({
				update: where((_row, { before, after }) => after.gte(before)),
			}),
		});
		expect(field(post, "n")).toContain(
			"PERMISSIONS FOR update WHERE $after >= $before;",
		);
	});

	test("session, token and access variables", () => {
		const post = table("post", {
			n: t.int().permissions({
				select: where((_row, { session, token, access }) =>
					and(
						session.ac.eq("account"),
						token.scope.eq("admin"),
						access.eq("account"),
					),
				),
			}),
		});
		expect(field(post, "n")).toContain(
			"PERMISSIONS FOR select WHERE $session.ac = 'account' AND $token.scope = 'admin' AND $access = 'account';",
		);
	});

	test("the string forms are unchanged", () => {
		const post = table("post", {
			a: t.string().permissions("FOR select, create, update NONE"),
			b: t.string().permissions("FULL"),
		});
		expect(field(post, "a")).toBe(
			"DEFINE FIELD a ON TABLE post TYPE string PERMISSIONS FOR select, create, update NONE;",
		);
		expect(field(post, "b")).toBe(
			"DEFINE FIELD b ON TABLE post TYPE string PERMISSIONS FULL;",
		);
	});

	test("permissions come before the comment", () => {
		const post = table("post", {
			a: t.string().permissions({ select: "none" }).comment("Hidden"),
		});
		expect(field(post, "a")).toBe(
			"DEFINE FIELD a ON TABLE post TYPE string PERMISSIONS FOR select NONE COMMENT 'Hidden';",
		);
	});

	test("a field has no delete permission", () => {
		const post = table("post", {
			// @ts-expect-error a field takes select, create and update
			a: t.string().permissions({ delete: "none" }),
		});
		expect(() => field(post, "a")).toThrow(
			"A field has no delete permission: use select, create, update",
		);
	});

	test("a nested field takes rules too", () => {
		const post = table("post", {
			meta: t.object({
				hidden: t.string().permissions({ select: "none" }),
			}),
		});
		expect(field(post, "meta.hidden")).toContain("PERMISSIONS FOR select NONE");
	});
});

describe("typed auth", () => {
	const { where: asUser } = authenticatedAs(user);

	test("a property of the authenticated record keeps its type", () => {
		const post = table("post", { owner: t.record("user") }).permissions({
			update: asUser((row, { auth }) =>
				or(
					row.owner.eq(auth.id),
					auth.role.eq("admin"),
					auth.name.startsWith("a"),
				),
			),
		});
		expect(defineTable(post)).toContain(
			"FOR update WHERE $this.owner = $auth.id OR $auth.role = 'admin' OR string::starts_with($auth.name, 'a')",
		);
	});

	test("a link followed through a table the rule was told about", () => {
		const post = table("post", { owner: t.record("user") }).permissions({
			select: asUser((row, { auth }) => row.owner.name.eq(auth.name)),
		});
		expect(defineTable(post)).toContain(
			"FOR select WHERE $this.owner.name = $auth.name",
		);
	});

	test("a table named after auth can be followed to others", () => {
		const team = table("team", { name: t.string() });
		const member = table("member", { team: t.record("team") });
		const { where: asMember } = authenticatedAs(member, team);
		const post = table("post", { owner: t.record("member") }).permissions({
			select: asMember((row, { auth }) =>
				row.owner.team.name.eq(auth.team.name),
			),
		});
		expect(defineTable(post)).toContain(
			"FOR select WHERE $this.owner.team.name = $auth.team.name",
		);
	});

	test("a loose auth reaches any property", () => {
		const post = table("post", { owner: t.record("user") }).permissions({
			select: where((row, { auth }) => row.owner.eq(auth.id)),
		});
		expect(defineTable(post)).toContain("$this.owner = $auth.id");
	});
});

describe("rendered values and conditions", () => {
	test("literals are written into the statement", () => {
		const probe = table("probe", {
			owner: t.record("user"),
			title: t.string(),
			n: t.float(),
		}).permissions({
			select: where((row) => row.owner.eq(new RecordId("user", "alice"))),
			create: where((row) => row.title.eq('it\'s "q"')),
			update: where((row) => row.n.eq(1.5)),
		});
		expect(defineTable(probe)).toContain(
			'FOR select WHERE $this.owner = (user:alice), FOR create WHERE $this.title = "it\'s \\"q\\"", FOR update WHERE $this.n = 1.5',
		);
	});

	test("strings are quoted the way SurrealDB stores them", () => {
		const rule = (value: string) =>
			defineTable(
				table("t", { s: t.string() }).permissions({
					select: where((row) => row.s.eq(value)),
				}),
			).replace(/^.*WHERE \$this\.s = /, "");

		expect(rule("plain")).toBe("'plain';");
		expect(rule("it's")).toBe('"it\'s";');
		expect(rule('say "hi"')).toBe("'say \"hi\"';");
		expect(rule(`both ' and "`)).toBe('"both \' and \\"";');
		expect(rule("back\\slash")).toBe("'back\\\\slash';");
		expect(rule('a \\" mix')).toBe("'a \\\\\" mix';");
		expect(rule("new\nline")).toBe("'new\\nline';");
	});

	test("redundant parentheses are dropped, needed ones kept", () => {
		const probe = table("probe", { n: t.int() }).permissions({
			select: where((row) => or(row.n.eq(1), and(row.n.gt(3), row.n.lt(10)))),
			create: where((row) => and(row.n.gt(0), or(row.n.eq(1), row.n.eq(2)))),
			update: where((row) => not(row.n.eq(1))),
			delete: where((row) => and(row.n.eq(1), and(row.n.eq(2), row.n.eq(3)))),
		});
		expect(defineTable(probe)).toBe(
			"DEFINE TABLE probe TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select WHERE $this.n = 1 OR $this.n > 3 AND $this.n < 10, FOR create WHERE $this.n > 0 AND ($this.n = 1 OR $this.n = 2), FOR update WHERE not($this.n = 1), FOR delete WHERE $this.n = 1 AND $this.n = 2 AND $this.n = 3;",
		);
	});
});

describe("where generation", () => {
	test("generateSchema renders typed rules, and resolves links across the ORM", () => {
		const { where: asUser } = authenticatedAs(user);
		const post = table("post", { owner: t.record("user") }).permissions({
			select: asUser((row) => row.owner.name.eq("x")),
		});
		const db = orm(new Surreal(), user, post);
		const { statements } = generateSchema(db);

		expect(statements.find((s) => s.name === "post")?.sql).toBe(
			"DEFINE TABLE OVERWRITE post TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select WHERE $this.owner.name = 'x';",
		);
	});

	test("defineSchema renders table and field rules together", () => {
		const post = table("post", {
			a: t.string().permissions({ select: "none" }),
		}).permissions({ select: "full" });

		expect(defineSchema(post)).toEqual([
			"DEFINE TABLE post TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select FULL;",
			"DEFINE FIELD a ON TABLE post TYPE string PERMISSIONS FOR select NONE;",
		]);
	});
});

// Compile-time equality assertion helper.
type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;
const assertType = <_T extends true>() => {};

describe("types", () => {
	test("permissions() does not change a field's inferred type", () => {
		const plain = t.option(t.string());
		const guarded = plain.permissions({
			select: where((_row, { auth }) => auth.id.ne(undefined)),
		});
		assertType<Equal<typeof guarded, typeof plain>>();
		assertType<Equal<(typeof guarded)["infer"], string | undefined>>();
		expect(guarded.name).toBe("option");
	});

	test("value, before and after are typed as the field", () => {
		table("post", {
			title: t.string().permissions({
				update: where((_row, { value, before, after }) =>
					and(value.ne("x"), before.ne(after)),
				),
			}),
			count: t.int().permissions({
				// @ts-expect-error value is a number, not a string
				update: where((_row, { value }) => value.eq("x")),
			}),
		});
		expect(true).toBe(true);
	});

	test("a table's rules are checked against its own fields", () => {
		table("post", { title: t.string(), owner: t.record("user") }).permissions({
			select: where((row, { auth }) => row.owner.eq(auth.id)),
			// @ts-expect-error `nope` is not a field of post
			update: where((row) => row.nope.eq(1)),
			// @ts-expect-error title is a string, not a number
			create: where((row) => row.title.eq(1)),
		});
		expect(true).toBe(true);
	});

	test("a typed auth is checked against its table", () => {
		const { where: asUser } = authenticatedAs(user);
		table("post", { owner: t.record("user") }).permissions({
			update: asUser((row, { auth }) => row.owner.eq(auth.id)),
			// @ts-expect-error role is a string
			select: asUser((_row, { auth }) => auth.role.eq(1)),
			// @ts-expect-error user has no `rank`
			create: asUser((_row, { auth }) => auth.rank.eq(1)),
		});
		expect(true).toBe(true);
	});

	test("a rule is a string or a typed condition, not anything else", () => {
		// @ts-expect-error a number is not a rule
		table("post", {}).permissions({ select: 1 });
		expect(true).toBe(true);
	});
});

describe("The documented examples", () => {
	// The README and the pull request show these, so they are pinned exactly:
	// the strings keep generating what they always did, and the mix is as shown.

	test("SurrealQL strings on a table", () => {
		const users = table("users", { name: t.string() }).permissions({
			select: "FULL",
			create: "$auth.id != NONE",
			update: "$auth.id = id",
			delete: "NONE",
		});

		expect(defineTable(users)).toBe(
			"DEFINE TABLE users TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select FULL, FOR create WHERE $auth.id != NONE, FOR update WHERE $auth.id = id, FOR delete NONE;",
		);
	});

	test("a SurrealQL string on a field", () => {
		const users = table("users", {
			avatar_url: t
				.option(t.string())
				.permissions("FOR select, create, update, delete FULL"),
		});

		expect(field(users, "avatar_url")).toBe(
			"DEFINE FIELD avatar_url ON TABLE users TYPE option<string> PERMISSIONS FOR select, create, update, delete FULL;",
		);
	});

	test("strings and a typed rule in one object", () => {
		const note = table("note", {
			title: t.string(),
			owner: t.record("user"),
		}).permissions({
			select: "full",
			create: where((row, { auth }) => row.owner.eq(auth.id)),
			delete: "none",
		});

		expect(defineTable(note, { tables: { user, note } })).toBe(
			"DEFINE TABLE note TYPE NORMAL SCHEMAFULL PERMISSIONS FOR select FULL, FOR create WHERE $this.owner = $auth.id, FOR delete NONE;",
		);
	});

	test("the keywords mean the same in either case", () => {
		const upper = table("t", { a: t.string() }).permissions({
			select: "FULL",
			delete: "NONE",
		});
		const lower = table("t", { a: t.string() }).permissions({
			select: "full",
			delete: "none",
		});

		expect(defineTable(lower)).toBe(defineTable(upper));
	});
});
