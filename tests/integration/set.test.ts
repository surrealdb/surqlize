import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import {
	generateSchema,
	type LiveMessage,
	orm,
	t,
	table,
	ValidationError,
} from "../../src";
import { atLeast, serverVersion } from "../helpers/db";
import { withTestDb } from "./setup";

// From 3.3 the database coerces a plain array into a set; before that it refuses one.
const coercesArrays = atLeast(await serverVersion(), 3, 3);

const doc = table("doc", {
	tags: t.set(t.string()),
	nums: t.set(t.int()),
	groups: t.set(t.object({ name: t.string() })),
});

describe("set fields (integration)", () => {
	const getTestDb = withTestDb({
		perTest: true,
		setup: async ({ surreal }) => {
			const { statements } = generateSchema(orm(surreal, doc));
			await surreal.query(statements.map((s) => `${s.sql};`).join("\n"));
		},
	});

	const make = () => orm(getTestDb().surreal, doc);

	const base = {
		tags: new Set(["a", "b"]),
		nums: new Set([1, 2]),
		groups: new Set([{ name: "x" }]),
	};

	test("creates a set field and reads it back as a Set", async () => {
		const db = make();
		const created = await db.create("doc", "one").content(base).only();
		expect(created.tags).toBeInstanceOf(Set);
		expect([...created.tags].sort()).toEqual(["a", "b"]);

		const [row] = await db.select("doc");
		expect(row?.tags).toBeInstanceOf(Set);
		expect(row?.tags.has("a")).toBe(true);
		expect(row?.nums.size).toBe(2);
		expect([...(row?.groups ?? [])]).toEqual([{ name: "x" }]);
	});

	test("an empty set round-trips", async () => {
		const db = make();
		await db
			.create("doc", "empty")
			.content({ ...base, tags: new Set<string>() });
		const [row] = await db.select("doc");
		expect(row?.tags).toBeInstanceOf(Set);
		expect(row?.tags.size).toBe(0);
	});

	test("a set written through set() and merge() is bound as a Set", async () => {
		const db = make();
		await db.create("doc", "w").content(base);
		await db.update("doc", "w").merge({ tags: new Set(["z"]) });
		const [row] = await db.select("doc");
		expect([...(row?.tags ?? [])]).toEqual(["z"]);
	});

	async function createWithArray(): Promise<boolean> {
		const { surreal } = getTestDb();
		try {
			await surreal.query("CREATE doc:arr CONTENT $d", {
				d: { ...base, tags: ["a"] },
			});
			return true;
		} catch {
			return false;
		}
	}

	test.skipIf(coercesArrays)(
		"a server before 3.3 refuses an array for a set field",
		async () => {
			expect(await createWithArray()).toBe(false);
		},
	);

	test.skipIf(!coercesArrays)(
		"a server from 3.3 accepts an array for a set field",
		async () => {
			// The client still rejects one (see the next test), so writing through
			// Surqlize always sends a Set.
			expect(await createWithArray()).toBe(true);
		},
	);

	test("the client validates before writing", async () => {
		const db = make().validated();
		await expect(
			db
				.create("doc")
				.content({ ...base, tags: ["a"] } as never)
				.execute(),
		).rejects.toBeInstanceOf(ValidationError);
		const err = await db
			.create("doc")
			.content({ ...base, nums: new Set(["x"]) } as never)
			.execute()
			.catch((e) => e);
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.issues[0].path).toBe("nums[0]");
	});

	test("set:: functions run against the database", async () => {
		const db = make();
		await db.create("doc", "f").content(base);
		const [row] = await db.select("doc").return((d) => ({
			size: d.tags.len(),
			has: d.tags.contains("a"),
			added: d.tags.add("c"),
			empty: d.tags.isEmpty(),
			joined: d.tags.join(","),
			first: d.nums.min(),
			union: d.tags.union(new Set(["q"])),
		}));
		expect(row?.size).toBe(2);
		expect(row?.has).toBe(true);
		expect(row?.added).toBeInstanceOf(Set);
		expect(row?.added.size).toBe(3);
		expect(row?.empty).toBe(false);
		expect(row?.joined.split(",").sort()).toEqual(["a", "b"]);
		expect(row?.first).toBe(1);
		expect([...(row?.union ?? [])].sort()).toEqual(["a", "b", "q"]);
	});

	test("filters on a set with WHERE", async () => {
		const db = make();
		await db.create("doc", "p").content(base);
		await db.create("doc", "q").content({ ...base, tags: new Set(["other"]) });
		const rows = await db.select("doc").where((d) => d.tags.contains("a"));
		expect(rows.map((r) => String(r.id))).toEqual([
			String(new RecordId("doc", "p")),
		]);
	});

	test("live queries deliver Sets", async () => {
		const db = make();
		const sub = await db.live("doc");
		const received = new Promise<LiveMessage<unknown>>((resolve) => {
			const off = sub.subscribe((m) => {
				if (m.action === "CREATE") {
					off();
					resolve(m);
				}
			});
		});
		await db.create("doc", "l").content(base);
		const message = (await Promise.race([
			received,
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("timed out")), 10_000),
			),
		])) as { value: { tags: Set<string> } };
		expect(message.value.tags).toBeInstanceOf(Set);
		expect([...message.value.tags].sort()).toEqual(["a", "b"]);
		await sub.kill();
	});

	test("objects inside a set are enforced through their [*] fields", async () => {
		const db = make();
		await expect(
			db
				.create("doc")
				.content({ ...base, groups: new Set([{ name: 1 }]) } as never)
				.execute(),
		).rejects.toThrow();
	});
});
