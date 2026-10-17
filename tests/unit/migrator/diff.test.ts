import { describe, expect, test } from "bun:test";
import { edge, t, table } from "../../../src";
import { diff } from "../../../src/migrator/diff";
import type {
	CurrentSchema,
	CurrentTable,
} from "../../../src/migrator/introspect";
import {
	access,
	analyzer,
	storedFunction,
} from "../../../src/schema/ddl/entities";

/**
 * Comparing a schema against a database.
 *
 * `CurrentSchema` is plain data — the statements `INFO FOR DB` reports — so
 * every rule here is testable without a connection. The strings used as
 * "stored" values are in the form SurrealDB actually returns, since the
 * comparison canonicalises both sides and a made-up shape would not exercise
 * that.
 */

/** A `CurrentSchema` holding one table. */
function database(
	table: Partial<CurrentTable> & { name: string },
): CurrentSchema {
	return {
		tables: {
			[table.name]: {
				definition: `DEFINE TABLE ${table.name} TYPE NORMAL SCHEMAFULL PERMISSIONS NONE`,
				fields: {},
				indexes: {},
				events: {},
				...table,
			},
		},
		entities: {
			analyzer: {},
			param: {},
			function: {},
			sequence: {},
			access: {},
			config: {},
		},
	};
}

/** An empty database. */
const empty: CurrentSchema = {
	tables: {},
	entities: database({ name: "x" }).entities,
};

/** The `up` statements of every change of a kind. */
function upFor(result: ReturnType<typeof diff>, kind: string): string[] {
	return result.changes.filter((c) => c.kind === kind).flatMap((c) => c.up);
}

describe("A table that does not exist yet", () => {
	test("is created with its fields", () => {
		const result = diff([table("user", { name: t.string() })], empty);

		expect(result.up.some((s) => s.startsWith("DEFINE TABLE user"))).toBe(true);
		expect(result.up.some((s) => s.includes("DEFINE FIELD name"))).toBe(true);
	});

	test("rolls back by dropping the table", () => {
		const result = diff([table("user", { name: t.string() })], empty);

		expect(result.down).toContain("REMOVE TABLE user;");
	});
});

describe("A schema that matches the database", () => {
	test("produces no changes", () => {
		const user = table("user", { name: t.string() });
		const current = database({
			name: "user",
			definition: "DEFINE TABLE user TYPE NORMAL SCHEMAFULL PERMISSIONS NONE",
			fields: {
				name: "DEFINE FIELD name ON user TYPE string PERMISSIONS FULL",
			},
		});

		expect(diff([user], current).changes).toEqual([]);
	});

	test("is unmoved by the normalisations SurrealDB applies", () => {
		// option<T> is stored as `none | T`, permissions are expanded, and
		// `ON TABLE t` is stored as `ON t`. None of these is a change.
		const user = table("user", { bio: t.option(t.string()) });
		const current = database({
			name: "user",
			fields: {
				bio: "DEFINE FIELD bio ON user TYPE none | string PERMISSIONS FULL",
			},
		});

		expect(diff([user], current).changes).toEqual([]);
	});
});

describe("A changed field", () => {
	const current = database({
		name: "user",
		fields: { age: "DEFINE FIELD age ON user TYPE int PERMISSIONS FULL" },
	});

	test("is redefined with OVERWRITE, since DEFINE errors on an existing field", () => {
		const result = diff([table("user", { age: t.int().default(0) })], current);

		expect(upFor(result, "field.modify")).toEqual([
			"DEFINE FIELD OVERWRITE age ON TABLE user TYPE int DEFAULT 0;",
		]);
	});

	test("rolls back to the stored definition verbatim", () => {
		const result = diff([table("user", { age: t.int().default(0) })], current);

		expect(result.down).toContain(
			"DEFINE FIELD age ON user TYPE int PERMISSIONS FULL;",
		);
	});
});

describe("Undeclared fields and tables", () => {
	const current = database({
		name: "user",
		fields: {
			name: "DEFINE FIELD name ON user TYPE string PERMISSIONS FULL",
			legacy: "DEFINE FIELD legacy ON user TYPE string PERMISSIONS FULL",
		},
	});

	test("are left alone by default", () => {
		// A schema is usually a partial view of a database; dropping whatever it
		// does not mention destroys data.
		const result = diff([table("user", { name: t.string() })], current);

		expect(result.changes).toEqual([]);
	});

	test("are dropped when asked for", () => {
		const result = diff([table("user", { name: t.string() })], current, {
			removeMissing: true,
		});

		expect(upFor(result, "field.remove")).toEqual([
			"REMOVE FIELD legacy ON TABLE user;",
		]);
	});

	test("an array's element field is never treated as drift", () => {
		// SurrealDB creates `tags.*` on its own for any declared array
		const withArray = database({
			name: "post",
			fields: {
				tags: "DEFINE FIELD tags ON post TYPE array<string> PERMISSIONS FULL",
				"tags.*": "DEFINE FIELD tags[*] ON post TYPE string PERMISSIONS FULL",
			},
		});

		const result = diff(
			[table("post", { tags: t.array(t.string()) })],
			withArray,
			{
				removeMissing: true,
			},
		);

		expect(result.changes).toEqual([]);
	});
});

describe("Renaming a field", () => {
	const withOld = database({
		name: "user",
		fields: {
			full_name: "DEFINE FIELD full_name ON user TYPE string PERMISSIONS FULL",
		},
	});

	const renamed = table("user", { name: t.string().was("full_name") });

	test("copies the value across instead of dropping the old field", () => {
		const up = upFor(diff([renamed], withOld), "field.rename");

		expect(up).toEqual([
			"DEFINE FIELD name ON TABLE user TYPE string;",
			"UPDATE user SET name = full_name;",
			"REMOVE FIELD full_name ON TABLE user;",
			"UPDATE user UNSET full_name;",
		]);
	});

	test("removes the field before unsetting it", () => {
		// While the definition stands, a SCHEMAFULL table enforces the old
		// field's assertions and rejects the unset.
		const up = upFor(diff([renamed], withOld), "field.rename");

		expect(up.indexOf("REMOVE FIELD full_name ON TABLE user;")).toBeLessThan(
			up.indexOf("UPDATE user UNSET full_name;"),
		);
	});

	test("never emits RENAME TO, which SurrealDB cannot parse", () => {
		expect(diff([renamed], withOld).up.join("\n")).not.toContain("RENAME");
	});

	test("never emits a bare drop of the renamed field", () => {
		const result = diff([renamed], withOld, { removeMissing: true });

		expect(upFor(result, "field.remove")).toEqual([]);
	});

	test("mirrors the rename in the rollback", () => {
		const { down } = diff([renamed], withOld);

		expect(down).toEqual([
			"DEFINE FIELD full_name ON user TYPE string PERMISSIONS FULL;",
			"UPDATE user SET full_name = name;",
			"REMOVE FIELD name ON TABLE user;",
			"UPDATE user UNSET name;",
		]);
	});

	test("carries other changes to the field as part of the rename", () => {
		const result = diff(
			[table("user", { name: t.string().was("full_name").default("anon") })],
			withOld,
		);

		expect(upFor(result, "field.rename")[0]).toContain("DEFAULT 'anon'");
	});
});

describe("Claiming a rename", () => {
	const withBoth = database({
		name: "user",
		fields: {
			full_name: "DEFINE FIELD full_name ON user TYPE string PERMISSIONS FULL",
			name: "DEFINE FIELD name ON user TYPE string PERMISSIONS FULL",
		},
	});

	const withNew = database({
		name: "user",
		fields: { name: "DEFINE FIELD name ON user TYPE string PERMISSIONS FULL" },
	});

	test("is idempotent — once applied, the same schema produces nothing", () => {
		const renamed = table("user", { name: t.string().was("full_name") });

		expect(diff([renamed], withNew).changes).toEqual([]);
	});

	test("is not claimed when the new name already exists", () => {
		// Both names present means the old field is a separate field, not a
		// source; renaming would silently overwrite the new one's data.
		const renamed = table("user", { name: t.string().was("full_name") });
		const result = diff([renamed], withBoth);

		expect(upFor(result, "field.rename")).toEqual([]);
	});

	test("is not claimed when the old name is absent", () => {
		const renamed = table("user", { name: t.string().was("never_existed") });

		expect(diff([renamed], withNew).changes).toEqual([]);
	});

	test("picks whichever of several previous names is present", () => {
		const renamed = table("user", {
			name: t.string().was("v1", "full_name", "v3"),
		});

		const up = upFor(
			diff(
				[renamed],
				database({
					name: "user",
					fields: {
						full_name:
							"DEFINE FIELD full_name ON user TYPE string PERMISSIONS FULL",
					},
				}),
			),
			"field.rename",
		);

		expect(up[1]).toBe("UPDATE user SET name = full_name;");
	});

	test("a field with no previous names is created, not renamed", () => {
		const result = diff([table("user", { name: t.string() })], empty);

		expect(upFor(result, "field.rename")).toEqual([]);
	});
});

describe("Renaming an attachment", () => {
	const current = database({
		name: "user",
		fields: {
			email: "DEFINE FIELD email ON user TYPE string PERMISSIONS FULL",
		},
		indexes: { old_idx: "DEFINE INDEX old_idx ON user FIELDS email UNIQUE" },
	});

	test("an index is redefined under the new name, then the old one dropped", () => {
		// An index holds no data of its own, so nothing has to be carried across
		const user = table("user", { email: t.string() }).index("new_idx", {
			fields: ["email"],
			unique: true,
			previousNames: ["old_idx"],
		});

		expect(upFor(diff([user], current), "index.modify")).toEqual([
			"DEFINE INDEX new_idx ON TABLE user FIELDS email UNIQUE;",
			"REMOVE INDEX old_idx ON TABLE user;",
		]);
	});

	test("the old index is not also reported as drift", () => {
		const user = table("user", { email: t.string() }).index("new_idx", {
			fields: ["email"],
			unique: true,
			previousNames: ["old_idx"],
		});

		expect(
			upFor(diff([user], current, { removeMissing: true }), "index.remove"),
		).toEqual([]);
	});
});

describe("Database-level entities", () => {
	const withOldFn = {
		tables: {},
		entities: {
			...empty.entities,
			function: { old_name: "DEFINE FUNCTION fn::old_name() { RETURN 1; }" },
		},
	};

	test("a function is renamed by redefining then dropping", () => {
		const fn = storedFunction("new_name", {
			body: "RETURN 1;",
			previousNames: ["old_name"],
		});

		const up = diff([fn], withOldFn).up;

		expect(up).toEqual([
			"DEFINE FUNCTION fn::new_name() { RETURN 1; };",
			"REMOVE FUNCTION fn::old_name;",
		]);
	});

	test("a function already at its new name produces nothing", () => {
		const fn = storedFunction("old_name", { body: "RETURN 1;" });

		expect(diff([fn], withOldFn).changes).toEqual([]);
	});
});

describe("Access methods and their signing keys", () => {
	const KEY = "hunter2-signing-key";

	/** What SurrealDB reports for a keyed access: the keys are hidden. */
	const stored =
		"DEFINE ACCESS jw ON DATABASE TYPE JWT ALGORITHM HS512 KEY '[REDACTED]' WITH ISSUER KEY '[REDACTED]' DURATION FOR TOKEN 1h, FOR SESSION NONE";

	const withStored = {
		tables: {},
		entities: { ...empty.entities, access: { jw: stored } },
	};

	const keyed = access("jw", {
		type: "JWT",
		algorithm: "HS512",
		key: KEY,
		issuerKey: KEY,
	});

	/** A declared access that hides nothing, so the diff manages the kind. */
	const bearer = access("grants", { type: "BEARER", for: "USER" });

	test("a new access runs with its key and displays without it", () => {
		const result = diff([keyed], empty);

		expect(result.up.join("\n")).toContain(KEY);
		expect(result.display.join("\n")).not.toContain(KEY);
		expect(result.changes[0]?.display.join("\n")).not.toContain(KEY);
	});

	test("every change has a display form, the same as up where nothing is hidden", () => {
		const result = diff([table("a", { x: t.string() }), keyed], empty);

		for (const change of result.changes) {
			expect(change.display).toHaveLength(change.up.length);
		}

		const created = result.changes.find((c) => c.kind === "table.create");
		expect(created?.display).toEqual([...(created?.up ?? [])]);
		expect(result.display).toEqual(result.changes.flatMap((c) => c.display));
	});

	test("a rename runs with the key and displays without it", () => {
		const renamed = access("jw2", {
			type: "JWT",
			key: KEY,
			previousNames: ["jw"],
		});

		const result = diff([renamed], withStored);

		expect(result.up.join("\n")).toContain(KEY);
		expect(result.display.join("\n")).not.toContain(KEY);
		expect(result.display.at(-1)).toBe("REMOVE ACCESS jw ON DATABASE;");
	});

	test("removing an undeclared access does not write a down that restores its hidden key", () => {
		const result = diff([bearer], withStored, { removeMissing: true });

		expect(result.down.join("\n")).not.toContain("[REDACTED]'");
		expect(result.down.some((s) => s.startsWith("DEFINE ACCESS jw"))).toBe(
			false,
		);
		// The reason is left in the history, so a rollback can say why it stops
		expect(result.down.join("\n")).toContain("jw");
	});

	test("renaming one does not write a down that restores the old one", () => {
		const renamed = access("jw2", {
			type: "JWT",
			key: KEY,
			previousNames: ["jw"],
		});

		const result = diff([renamed], withStored);

		expect(result.down.join("\n")).not.toContain("[REDACTED]'");
		expect(result.down.some((s) => s.startsWith("DEFINE ACCESS jw"))).toBe(
			false,
		);
	});

	test("replacing one does not write a down that restores its hidden key", () => {
		// A published key set is compared, so a keyed access under the same name
		// is modified, and its stored form is the down
		const replaced = access("jw", { type: "JWT", url: "https://issuer/jwks" });

		const result = diff([replaced], withStored);

		expect(result.changes[0]?.kind).toBe("entity.modify");
		expect(result.down.join("\n")).not.toContain("[REDACTED]'");
	});

	test("an access that hides nothing still restores from its stored form", () => {
		const storedBearer =
			"DEFINE ACCESS gone ON DATABASE TYPE BEARER FOR USER DURATION FOR GRANT 4w2d, FOR TOKEN 1h, FOR SESSION NONE";
		const current = {
			tables: {},
			entities: { ...empty.entities, access: { gone: storedBearer } },
		};

		const result = diff([bearer], current, { removeMissing: true });

		expect(result.down).toContain(`${storedBearer};`);
	});
});

describe("An analyzer that an index uses", () => {
	// The server will not remove an analyzer while an index names it, so the
	// index has to be redefined or dropped before the analyzer goes.
	const tokenizers = ["blank"];
	const posts = (using: string) =>
		table("post", { body: t.string() }).index("body_ft", {
			fields: ["body"],
			fulltext: { analyzer: using },
		});

	/** A database whose `post` index uses analyzer `old`, with `keep` beside it. */
	const current: CurrentSchema = {
		...database({
			name: "post",
			fields: {
				body: "DEFINE FIELD body ON post TYPE string PERMISSIONS FULL",
			},
			indexes: {
				body_ft:
					"DEFINE INDEX body_ft ON post FIELDS body FULLTEXT ANALYZER old BM25(1.2,0.75)",
			},
		}),
		entities: {
			...empty.entities,
			analyzer: {
				old: "DEFINE ANALYZER old TOKENIZERS BLANK",
				keep: "DEFINE ANALYZER keep TOKENIZERS BLANK",
			},
		},
	};

	const defineOld = "DEFINE ANALYZER old TOKENIZERS BLANK;";
	const oldIndex =
		"DEFINE INDEX body_ft ON post FIELDS body FULLTEXT ANALYZER old BM25(1.2,0.75);";

	test("is renamed after the index has moved to the new name", () => {
		const result = diff(
			[
				analyzer("fresh", { tokenizers, previousNames: ["old"] }),
				analyzer("keep", { tokenizers }),
				posts("fresh"),
			],
			current,
		);

		expect(result.up).toEqual([
			"DEFINE ANALYZER fresh TOKENIZERS BLANK;",
			"DEFINE INDEX OVERWRITE body_ft ON TABLE post FIELDS body FULLTEXT ANALYZER fresh BM25(1.2,0.75);",
			"REMOVE ANALYZER old;",
		]);
	});

	test("is renamed in two steps that roll back in the opposite order", () => {
		const result = diff(
			[
				analyzer("fresh", { tokenizers, previousNames: ["old"] }),
				analyzer("keep", { tokenizers }),
				posts("fresh"),
			],
			current,
		);

		// The old analyzer is back before the index returns to it, and the new
		// one goes only once the index has left it
		expect(result.down).toEqual([
			defineOld,
			oldIndex,
			"REMOVE ANALYZER fresh;",
		]);
	});

	test("a rename is never reported as a removal", () => {
		// The CLI asks before applying anything whose kind ends in `remove`, and a
		// rename never did
		const result = diff(
			[
				analyzer("fresh", { tokenizers, previousNames: ["old"] }),
				analyzer("keep", { tokenizers }),
				posts("fresh"),
			],
			current,
			{ removeMissing: true },
		);

		expect(result.changes.map((c) => c.kind)).toEqual([
			"entity.modify",
			"index.modify",
			"entity.modify",
		]);
	});

	test("is removed after the index has moved to another", () => {
		const result = diff(
			[analyzer("keep", { tokenizers }), posts("keep")],
			current,
			{ removeMissing: true },
		);

		expect(result.up).toEqual([
			"DEFINE INDEX OVERWRITE body_ft ON TABLE post FIELDS body FULLTEXT ANALYZER keep BM25(1.2,0.75);",
			"REMOVE ANALYZER old;",
		]);
		expect(result.down).toEqual([defineOld, oldIndex]);
	});

	test("is removed after the index that used it is dropped", () => {
		const result = diff(
			[analyzer("keep", { tokenizers }), table("post", { body: t.string() })],
			current,
			{ removeMissing: true },
		);

		expect(result.up).toEqual([
			"REMOVE INDEX body_ft ON TABLE post;",
			"REMOVE ANALYZER old;",
		]);
		expect(result.down).toEqual([defineOld, oldIndex]);
	});

	test("is removed after the table that held the index is dropped", () => {
		const result = diff([analyzer("keep", { tokenizers })], current, {
			removeMissing: true,
		});

		expect(result.up).toEqual(["REMOVE TABLE post;", "REMOVE ANALYZER old;"]);
	});

	test("a new analyzer is still defined before the index that names it", () => {
		const result = diff(
			[
				analyzer("old", { tokenizers }),
				analyzer("keep", { tokenizers }),
				analyzer("fresh", { tokenizers }),
				posts("fresh"),
			],
			current,
		);

		expect(result.up).toEqual([
			"DEFINE ANALYZER fresh TOKENIZERS BLANK;",
			"DEFINE INDEX OVERWRITE body_ft ON TABLE post FIELDS body FULLTEXT ANALYZER fresh BM25(1.2,0.75);",
		]);
	});

	test("a changed analyzer is still redefined before the index", () => {
		const result = diff(
			[
				analyzer("old", { tokenizers, filters: ["lowercase"] }),
				analyzer("keep", { tokenizers }),
				table("post", { body: t.string() }).index("body_ft", {
					fields: ["body"],
					fulltext: { analyzer: "old", highlights: true },
				}),
			],
			current,
		);

		expect(result.changes.map((c) => c.kind)).toEqual([
			"entity.modify",
			"index.modify",
		]);
	});
});

describe("Edges", () => {
	test("are created as relations", () => {
		const result = diff(
			[edge("user", "liked", "post", { at: t.date() })],
			empty,
		);

		expect(result.up[0]).toContain("TYPE RELATION IN user OUT post");
	});

	test("never define their own in and out", () => {
		const result = diff([edge("user", "liked", "post", {})], empty);

		expect(result.up.join("\n")).not.toContain("DEFINE FIELD in");
		expect(result.up.join("\n")).not.toContain("DEFINE FIELD out");
	});

	test("never offer to remove in and out", () => {
		// SurrealDB defines the endpoints itself, so they are reported by
		// `INFO FOR TABLE` while the schema does not declare them. Reading that
		// as drift makes `--remove-missing` strip the endpoints off every edge
		// in the database, which is not recoverable by re-running the migration.
		const withEndpoints = database({
			name: "liked",
			definition:
				"DEFINE TABLE liked TYPE RELATION IN user OUT post SCHEMAFULL PERMISSIONS NONE",
			fields: {
				in: "DEFINE FIELD in ON liked TYPE record<user> PERMISSIONS FULL",
				out: "DEFINE FIELD out ON liked TYPE record<post> PERMISSIONS FULL",
				at: "DEFINE FIELD at ON liked TYPE datetime PERMISSIONS FULL",
			},
		});

		const result = diff(
			[edge("user", "liked", "post", { at: t.date() })],
			withEndpoints,
			{ removeMissing: true },
		);

		expect(result.up.join("\n")).not.toContain("REMOVE FIELD in");
		expect(result.up.join("\n")).not.toContain("REMOVE FIELD out");
		expect(result.changes).toEqual([]);
	});

	test("still remove a field the schema really has dropped", () => {
		// The guard above is about the two SurrealDB owns, not about edges being
		// exempt from removal.
		const withStale = database({
			name: "liked",
			definition:
				"DEFINE TABLE liked TYPE RELATION IN user OUT post SCHEMAFULL PERMISSIONS NONE",
			fields: {
				in: "DEFINE FIELD in ON liked TYPE record<user> PERMISSIONS FULL",
				out: "DEFINE FIELD out ON liked TYPE record<post> PERMISSIONS FULL",
				note: "DEFINE FIELD note ON liked TYPE string PERMISSIONS FULL",
			},
		});

		const result = diff([edge("user", "liked", "post", {})], withStale, {
			removeMissing: true,
		});

		expect(result.up.join("\n")).toContain("REMOVE FIELD note ON TABLE liked;");
	});
});

describe("The shape of a diff", () => {
	test("up follows declaration order and down reverses it", () => {
		const result = diff(
			[table("a", { x: t.string() }), table("b", { y: t.string() })],
			empty,
		);

		expect(result.up[0]).toContain("DEFINE TABLE a");
		expect(result.down[0]).toBe("REMOVE TABLE b;");
	});

	test("up and down are the changes flattened", () => {
		const result = diff([table("a", { x: t.string() })], empty);

		expect(result.up).toEqual(result.changes.flatMap((c) => c.up));
	});
});
