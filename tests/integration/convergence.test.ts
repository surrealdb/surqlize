import { describe, expect, test } from "bun:test";
import { edge, expr, t, table } from "../../src";
import type { Definition } from "../../src/cli/schema";
import { diff } from "../../src/migrator/diff";
import { introspect } from "../../src/migrator/introspect";
import {
	access,
	analyzer,
	config,
	param,
	sequence,
	storedFunction,
} from "../../src/schema/ddl/entities";
import { atLeast, serverVersion } from "../helpers/db";
import { withTestDb } from "./setup";

// What a key-set access reads back (only the session duration, `NONE` unless
// one was given) was observed on 3.2.3, so these run from there.
const keySetReadBack = atLeast(await serverVersion(), 3, 2);

/**
 * Applying a schema twice must do nothing the second time.
 *
 * This is the property everything rests on, and the only real check on
 * `canonical.ts`: SurrealDB rewrites definitions as it stores them, so a rule
 * that fails to account for one rewrite leaves the schema looking permanently
 * modified and the migration reapplying the same change forever.
 *
 * The unit tests pin each rewrite individually. These run the whole surface —
 * every type, every modifier, every index kind, every entity — through a real
 * server, which is the only way to catch a rewrite nobody has thought of.
 */
describe("Convergence", () => {
	const db = withTestDb({ perTest: true });

	/** Apply a schema, then report what a second run would still want to do. */
	async function applyTwice(definitions: Definition[]): Promise<string[]> {
		const before = await introspect(db().surreal);
		const { up } = diff(definitions, before);
		if (up.length) await db().surreal.query(up.join("\n"));

		const after = await introspect(db().surreal);
		return diff(definitions, after).up;
	}

	test("every scalar type", async () => {
		const probe = table("probe", {
			text: t.string(),
			flag: t.bool(),
			whole: t.int(),
			real: t.float(),
			exact: t.decimal(),
			loose: t.number(),
			when: t.date(),
			how_long: t.duration(),
			unique_id: t.uuid(),
			blob: t.bytes(),
			anything: t.any(),
			nothing: t.null(),
			span: t.range(),
		});

		expect(await applyTwice([probe])).toEqual([]);
	});

	test("every composite type", async () => {
		const probe = table("probe", {
			maybe: t.option(t.string()),
			list: t.array(t.string()),
			capped: t.array(t.int(), 10),
			distinct: t.set(t.string()),
			distinct_capped: t.set(t.int(), 3),
			distinct_option: t.option(t.set(t.string())),
			distinct_objects: t.set(t.object({ name: t.string() })),
			link: t.record("other"),
			multi_link: t.record(["a", "b"]),
			any_link: t.record(),
			place: t.geometry("point"),
			anywhere: t.geometry(),
			choice: t.union([t.literal("on"), t.literal("off")]),
			nested: t.object({ inner: t.object({ deep: t.string() }) }),
			deep_list: t.array(t.object({ sku: t.string() })),
			awkward: t.option(t.array(t.option(t.record("other")))),
		});

		expect(await applyTwice([probe])).toEqual([]);
	});

	test("every field modifier", async () => {
		const probe = table("probe", {
			fixed: t.string().readonly(),
			loose: t.object({}).flexible(),
			preset: t.string().default("draft"),
			computed_at: t.date().defaultAlways(expr("time::now()")),
			derived: t.string().valueExpr("string::lowercase($value)"),
			deferred: t.int().computed("1 + 1"),
			checked: t.int().assert("$value >= 0").assert("$value <= 10"),
			guarded: t.string().permissions("FOR select FULL"),
			described: t.string().comment("A note"),
			linked: t.record("other").references().onDelete("CASCADE"),
		});

		expect(await applyTwice([probe])).toEqual([]);
	});

	test("table-level options", async () => {
		const plain = table("plain", { a: t.string() }).comment("Plain");
		const loose = table("loose", { a: t.string() }).schemaless();
		const watched = table("watched", { a: t.string() }).changefeed("1h", true);
		const guarded = table("guarded", { a: t.string() }).permissions(
			"FOR select FULL",
		);

		expect(await applyTwice([plain, loose, watched, guarded])).toEqual([]);
	});

	test("every index kind", async () => {
		// A full-text index has to name an analyzer: SurrealDB has none of its own.
		const simple = analyzer("simple", { tokenizers: ["blank"] });
		const probe = table("probe", {
			email: t.string(),
			body: t.string(),
			vector: t.array(t.float()),
		})
			.index("plain", { fields: ["email"] })
			.index("unique", { fields: ["email"], unique: true })
			.index("composite", { fields: ["email", "body"] })
			.index("text", {
				fields: ["body"],
				fulltext: { analyzer: "simple", highlights: true },
			})
			.index("vec", {
				fields: ["vector"],
				hnsw: { dimension: 4, dist: "COSINE" },
			})
			.index("rows", { count: true });

		expect(await applyTwice([simple, probe])).toEqual([]);
	});

	test("a full-text index with an analyzer and tuned BM25", async () => {
		const english = analyzer("english", {
			tokenizers: ["blank", "class"],
			filters: ["lowercase", "ascii"],
		});

		const probe = table("probe", { body: t.string() }).index("text", {
			fields: ["body"],
			fulltext: {
				analyzer: "english",
				bm25: { k1: 1.2, b: 0.75 },
				highlights: true,
			},
		});

		expect(await applyTwice([english, probe])).toEqual([]);
	});

	test("events on every trigger", async () => {
		const probe = table("probe", { a: t.string() })
			.event("made", { on: "CREATE", body: "RETURN 1" })
			.event("changed", {
				on: "UPDATE",
				when: "$after.a != $before.a",
				body: "RETURN 1",
			})
			.event("gone", { on: "DELETE", body: "RETURN 1" })
			.event("any", {
				on: ["CREATE", "UPDATE"],
				body: "LET $x = 1; RETURN $x;",
			})
			.event("noted", { on: "CREATE", body: "RETURN 1", comment: "A note" });

		expect(await applyTwice([probe])).toEqual([]);
	});

	test("edges, including multi-table and enforced", async () => {
		const simple = edge("user", "liked", "post", { at: t.date() });
		const strict = edge("user", "wrote", "post", {}).enforced();
		const wide = edge(["user", "bot"], "tagged", "tag", { weight: t.float() });

		expect(await applyTwice([simple, strict, wide])).toEqual([]);
	});

	test("every database-level entity", async () => {
		const definitions = [
			analyzer("simple", { tokenizers: ["blank"] }),
			analyzer("filtered", {
				tokenizers: ["blank", "class"],
				filters: ["lowercase", "ascii", "snowball(english)"],
			}),
			param("app_name", { value: "'Surqlize'" }),
			storedFunction("double", {
				args: [["n", "int"]],
				returns: "int",
				body: "RETURN $n * 2;",
			}),
			sequence("order_no"),
			sequence("invoice_no", { start: 1000, batch: 50 }),
		];

		expect(await applyTwice(definitions)).toEqual([]);
	});

	test("configs", async () => {
		const definitions = [
			config("GRAPHQL", { tables: "AUTO", functions: "AUTO" }),
			config("API", { permissions: "FULL" }),
		];

		expect(await applyTwice(definitions)).toEqual([]);
	});

	test("a graphql config naming its tables", async () => {
		const user = table("user", { name: t.string() });
		const post = table("post", { title: t.string() });

		expect(
			await applyTwice([
				user,
				post,
				config("GRAPHQL", { tables: ["user", "post"], functions: "NONE" }),
			]),
		).toEqual([]);
	});

	test("bearer access, which hides nothing and so must converge", async () => {
		// Unlike a record access, every duration is reported back, so the
		// declared definition has to carry the ones SurrealDB fills in.
		const definitions = [
			access("grants_user", { type: "BEARER", for: "USER" }),
			access("grants_record", { type: "BEARER", for: "RECORD" }),
			access("grants_tuned", {
				type: "BEARER",
				for: "USER",
				duration: { grant: "30d", session: "1h" },
			}),
		];

		expect(await applyTwice(definitions)).toEqual([]);
	});

	test.skipIf(!keySetReadBack)(
		"a JWT access backed by a key set, which hides nothing and so must converge",
		async () => {
			// Only the session duration is reported back for one: a token lives as
			// long as the issuer says, so a token duration is dropped on the way in.
			const url = "https://issuer.example/.well-known/jwks.json";
			const definitions = [
				access("jwks_plain", { type: "JWT", url }),
				access("jwks_session", {
					type: "JWT",
					url,
					duration: { session: "2h" },
				}),
				access("jwks_tuned", {
					type: "JWT",
					url,
					duration: { token: "15m", session: "30d" },
				}),
			];

			expect(await applyTwice(definitions)).toEqual([]);
		},
	);

	test.skipIf(!keySetReadBack)(
		"a changed session duration on a key set is applied once",
		async () => {
			const url = "https://issuer.example/.well-known/jwks.json";
			await applyTwice([access("jwks", { type: "JWT", url })]);

			const changed = [
				access("jwks", { type: "JWT", url, duration: { session: "2h" } }),
			];
			const pending = diff(changed, await introspect(db().surreal));
			expect(pending.up).toHaveLength(1);
			expect(pending.up[0]).toContain("DEFINE ACCESS OVERWRITE jwks");

			expect(await applyTwice(changed)).toEqual([]);
		},
	);

	test.skipIf(!keySetReadBack)(
		"a key set defined before the duration was stated stops showing as modified",
		async () => {
			// Written as the generator used to write them: with no session duration,
			// and with a token duration the server drops. What the database holds is
			// what it made of those, so these are databases from before the change.
			await db().surreal.query(`
			DEFINE ACCESS old_plain ON DATABASE TYPE JWT URL 'https://issuer.example/jwks';
			DEFINE ACCESS old_token ON DATABASE TYPE JWT URL 'https://issuer.example/jwks' DURATION FOR TOKEN 15m;
			DEFINE ACCESS old_both ON DATABASE TYPE JWT URL 'https://issuer.example/jwks' DURATION FOR TOKEN 15m, FOR SESSION 2h;
		`);

			const url = "https://issuer.example/jwks";
			const declared = [
				access("old_plain", { type: "JWT", url }),
				access("old_token", { type: "JWT", url, duration: { token: "15m" } }),
				access("old_both", {
					type: "JWT",
					url,
					duration: { token: "15m", session: "2h" },
				}),
			];

			expect(diff(declared, await introspect(db().surreal)).up).toEqual([]);
		},
	);

	test("a JWT access with a key is created once and then left alone", async () => {
		// The key is reported back as '[REDACTED]', so it is never compared
		const definitions = [
			access("hmac", { type: "JWT", algorithm: "HS256", key: "secret" }),
			access("signing", {
				type: "JWT",
				algorithm: "HS512",
				key: "secret",
				issuerKey: "secret",
				duration: { token: "15m", session: "12h" },
			}),
		];

		expect(await applyTwice(definitions)).toEqual([]);
	});

	test("an access method is created once and then left alone", async () => {
		// SurrealDB reports the signing key as '[REDACTED]', so the stored
		// definition can never equal the declared one. Re-applying it would
		// rotate the key and invalidate every issued token.
		const method = access("user", {
			signin: "SELECT * FROM user WHERE email = $email",
			duration: { session: "7d" },
		});

		expect(await applyTwice([method])).toEqual([]);
	});

	test("everything at once", async () => {
		const english = analyzer("english", { tokenizers: ["blank"] });

		const user = table("user", {
			email: t.string().assert("string::is_email($value)"),
			bio: t.option(t.string()),
			joined: t.date().default(expr("time::now()")).readonly(),
			profile: t.object({ city: t.string(), tags: t.array(t.string()) }),
		})
			.comment("People")
			.index("email_uq", { fields: ["email"], unique: true })
			.event("welcome", { on: "CREATE", body: "RETURN 1" });

		const post = table("post", {
			title: t.string(),
			body: t.string(),
			author: t.record("user"),
			scores: t.array(t.float()),
		}).index("search", { fields: ["body"], fulltext: { analyzer: "english" } });

		const liked = edge("user", "liked", "post", { at: t.date() });

		expect(await applyTwice([english, user, post, liked])).toEqual([]);
	});
});

/**
 * Defaults are worth their own pass: quoting is decided by inspecting the
 * value, and a wrong guess is silent — `DEFAULT 'time::now()'` is valid
 * SurrealQL that stores the text of the call rather than calling it.
 */
describe("Defaults converge and mean what they say", () => {
	const db = withTestDb({ perTest: true });

	async function applyTwice(definitions: Definition[]): Promise<string[]> {
		const before = await introspect(db().surreal);
		const { up } = diff(definitions, before);
		if (up.length) await db().surreal.query(up.join("\n"));

		const after = await introspect(db().surreal);
		return diff(definitions, after).up;
	}

	test("literals of every shape", async () => {
		const probe = table("probe", {
			text: t.string().default("draft"),
			apostrophe: t.string().default("it's"),
			punctuation: t.string().default("a, b; c: d"),
			empty: t.string().default(""),
			zero: t.int().default(0),
			negative: t.int().default(-42),
			fractional: t.float().default(3.14),
			yes: t.bool().default(true),
			no: t.bool().default(false),
			list: t.array(t.string()).default([]),
			structure: t.object({}).flexible().default({}),
		});

		expect(await applyTwice([probe])).toEqual([]);
	});

	test("a set default is applied by the database", async () => {
		// A `Set` has no JSON form: it used to be printed as `DEFAULT {}`, which
		// the server accepts and then refuses on every create that relies on it.
		const probe = table("probe", {
			some: t.set(t.string()).default(new Set(["a", "b"])),
			empty: t.set(t.string()).default(new Set<string>()),
			maybe: t.option(t.set(t.int())).default(new Set<number>()),
			always: t.set(t.int()).defaultAlways(new Set([1])),
		});

		expect(await applyTwice([probe])).toEqual([]);

		const [created] =
			await db().surreal.query<[Record<string, unknown>[]]>(
				"CREATE probe:one;",
			);
		const row = created?.[0];

		expect(row?.some).toBeInstanceOf(Set);
		expect([...(row?.some as Set<string>)].sort()).toEqual(["a", "b"]);
		expect(row?.empty).toEqual(new Set());
		expect(row?.maybe).toEqual(new Set());
		expect(row?.always).toEqual(new Set([1]));
	});

	test("a default written as expr('<set>[]') converges", async () => {
		// It reads back as `DEFAULT <set> []`, with a space the schema never wrote
		const probe = table("probe", {
			written: t.set(t.string()).default(expr("<set>[]")),
			always: t.set(t.string()).defaultAlways(expr("<set>[]")),
		});

		expect(await applyTwice([probe])).toEqual([]);
	});

	test("an expression default is called, not stored as text", async () => {
		const probe = table("probe", { at: t.date().default(expr("time::now()")) });

		expect(await applyTwice([probe])).toEqual([]);

		const [created] = await db().surreal.query<[{ at: unknown }[]]>(
			"CREATE probe RETURN at;",
		);

		// The call ran: a stored literal would come back as the text of it
		expect(String(created?.[0]?.at)).not.toBe("time::now()");
		expect(String(created?.[0]?.at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	test("a bare word is a literal even when it looks like a path", async () => {
		// Without parentheses there is nothing to distinguish `a::b` from text
		const probe = table("probe", { label: t.string().default("some::thing") });

		expect(await applyTwice([probe])).toEqual([]);

		const [created] = await db().surreal.query<[{ label: string }[]]>(
			"CREATE probe RETURN label;",
		);

		expect(created?.[0]?.label).toBe("some::thing");
	});

	test("an expr() default is passed through as SurrealQL", async () => {
		const probe = table("probe", {
			label: t.string().default(expr("time::now()")),
		});

		const { up } = diff([probe], await introspect(db().surreal));

		expect(up.join("\n")).toContain("DEFAULT time::now()");
	});

	test("a string that looks like a call is stored as text", async () => {
		// Only expr() is SurrealQL: a string is data
		const probe = table("probe", {
			label: t.string().default("time::now()"),
		});

		expect(await applyTwice([probe])).toEqual([]);

		const [created] = await db().surreal.query<[{ label: string }[]]>(
			"CREATE probe RETURN label;",
		);

		expect(created?.[0]?.label).toBe("time::now()");
	});
});

/**
 * What a rename leaves behind.
 *
 * SurrealDB allows `REMOVE FIELD` while an index still covers the field, and
 * the index survives pointing at something that no longer exists — silently
 * indexing NONE for every row, so a UNIQUE index stops rejecting duplicates.
 */
describe("Renaming a field that an index covers", () => {
	const db = withTestDb({ perTest: true });

	test("repoints the index in the same migration", async () => {
		const before = table("user", { full_name: t.string() }).index("by_name", {
			fields: ["full_name"],
			unique: true,
		});

		const first = diff([before], await introspect(db().surreal));
		await db().surreal.query(first.up.join("\n"));
		await db().surreal.query("CREATE user SET full_name = 'Ada';");

		const after = table("user", { name: t.string().was("full_name") }).index(
			"by_name",
			{ fields: ["name"], unique: true },
		);

		const second = diff([after], await introspect(db().surreal));
		await db().surreal.query(second.up.join("\n"));

		const [info] = await db().surreal.query<
			[{ indexes: Record<string, string> }]
		>("INFO FOR TABLE user;");

		expect(info.indexes.by_name).toContain("FIELDS name");
		expect(info.indexes.by_name).not.toContain("full_name");
	});

	test("keeps the data and the index's guarantee", async () => {
		const before = table("user", { full_name: t.string() }).index("by_name", {
			fields: ["full_name"],
			unique: true,
		});

		await db().surreal.query(
			diff([before], await introspect(db().surreal)).up.join("\n"),
		);
		await db().surreal.query("CREATE user SET full_name = 'Ada';");

		const after = table("user", { name: t.string().was("full_name") }).index(
			"by_name",
			{ fields: ["name"], unique: true },
		);

		await db().surreal.query(
			diff([after], await introspect(db().surreal)).up.join("\n"),
		);

		const [rows] = await db().surreal.query<[{ name: string }[]]>(
			"SELECT name FROM user;",
		);
		expect(rows?.[0]?.name).toBe("Ada");

		// The rebuilt index still rejects a duplicate
		const duplicate = await db()
			.surreal.query("CREATE user SET name = 'Ada';")
			.then(() => null)
			.catch((reason: unknown) => String(reason));

		expect(duplicate).toContain("already contains");
	});

	test("an index the schema does not declare is left dangling", async () => {
		// Worth pinning because it is a trap rather than a bug in the migrator:
		// SurrealDB does not drop an index when its field goes, so an index kept
		// outside the schema silently stops working after a rename.
		const before = table("user", { full_name: t.string() });

		await db().surreal.query(
			diff([before], await introspect(db().surreal)).up.join("\n"),
		);
		await db().surreal.query(
			"DEFINE INDEX undeclared ON TABLE user FIELDS full_name UNIQUE;",
		);

		const after = table("user", { name: t.string().was("full_name") });
		await db().surreal.query(
			diff([after], await introspect(db().surreal)).up.join("\n"),
		);

		const [info] = await db().surreal.query<
			[{ indexes: Record<string, string> }]
		>("INFO FOR TABLE user;");

		expect(info.indexes.undeclared).toContain("full_name");
	});
});
