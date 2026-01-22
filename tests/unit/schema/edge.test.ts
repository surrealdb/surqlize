import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { edge, t } from "../../../src";

describe("EdgeSchema", () => {
	test("creates edge with from, to, and table name", () => {
		const authored = edge("user", "authored", "post", {
			created: t.date(),
		});

		expect(authored.from).toBe("user");
		expect(authored.tb).toBe("authored");
		expect(authored.to).toBe("post");
		expect(authored._fields).toHaveProperty("created");
	});

	test("auto-generates id, in, and out fields", () => {
		const authored = edge("user", "authored", "post", {
			created: t.date(),
		});

		const fields = authored.fields;
		expect(fields).toHaveProperty("id");
		expect(fields).toHaveProperty("in");
		expect(fields).toHaveProperty("out");

		expect(fields.id.name).toBe("record");
		expect(fields.id.tb).toBe("authored");

		expect(fields.in.name).toBe("record");
		expect(fields.in.tb).toBe("user");

		expect(fields.out.name).toBe("record");
		expect(fields.out.tb).toBe("post");
	});

	test("includes all user-defined fields", () => {
		const authored = edge("user", "authored", "post", {
			created: t.date(),
			updated: t.date(),
			note: t.string(),
		});

		const fields = authored.fields;
		expect(fields).toHaveProperty("created");
		expect(fields).toHaveProperty("updated");
		expect(fields).toHaveProperty("note");
		expect(fields).toHaveProperty("id");
		expect(fields).toHaveProperty("in");
		expect(fields).toHaveProperty("out");
	});

	test("creates schema as ObjectType", () => {
		const authored = edge("user", "authored", "post", {
			created: t.date(),
		});

		const schema = authored.schema;
		expect(schema.name).toBe("object");
		expect(schema.schema).toHaveProperty("created");
		expect(schema.schema).toHaveProperty("id");
		expect(schema.schema).toHaveProperty("in");
		expect(schema.schema).toHaveProperty("out");
	});

	test("validates edge records correctly", () => {
		const authored = edge("user", "authored", "post", {
			created: t.date(),
		});

		const validRecord = {
			id: new RecordId("authored", "123"),
			in: new RecordId("user", "alice"),
			out: new RecordId("post", "post1"),
			created: new Date(),
		};

		const invalidRecord = {
			id: new RecordId("authored", "123"),
			in: new RecordId("user", "alice"),
			out: new RecordId("post", "post1"),
			created: "2024-01-01", // wrong type - should be Date
		};

		expect(authored.validate(validRecord)).toBe(true);
		expect(authored.validate(invalidRecord)).toBe(false);
	});

	test("handles edges with no additional fields", () => {
		const follows = edge("user", "follows", "user", {});

		const fields = follows.fields;
		expect(fields).toHaveProperty("id");
		expect(fields).toHaveProperty("in");
		expect(fields).toHaveProperty("out");

		const validRecord = {
			id: new RecordId("follows", "1"),
			in: new RecordId("user", "alice"),
			out: new RecordId("user", "bob"),
		};

		expect(follows.validate(validRecord)).toBe(true);
	});

	test("handles edges with complex fields", () => {
		const authored = edge("user", "authored", "post", {
			metadata: t.object({
				drafted: t.date(),
				published: t.date(),
			}),
			tags: t.array(t.string()),
			featured: t.bool(),
		});

		const validRecord = {
			id: new RecordId("authored", "1"),
			in: new RecordId("user", "alice"),
			out: new RecordId("post", "post1"),
			metadata: {
				drafted: new Date("2024-01-01"),
				published: new Date("2024-01-02"),
			},
			tags: ["tech", "tutorial"],
			featured: true,
		};

		expect(authored.validate(validRecord)).toBe(true);
	});

	test("handles self-referential edges", () => {
		const follows = edge("user", "follows", "user", {
			since: t.date(),
		});

		expect(follows.from).toBe("user");
		expect(follows.to).toBe("user");

		const validRecord = {
			id: new RecordId("follows", "1"),
			in: new RecordId("user", "alice"),
			out: new RecordId("user", "bob"),
			since: new Date(),
		};

		expect(follows.validate(validRecord)).toBe(true);
	});
});
