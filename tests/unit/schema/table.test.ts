import { describe, expect, test } from "bun:test";
import { RecordId } from "surrealdb";
import { t, table } from "../../../src";

describe("TableSchema", () => {
	test("creates table with fields", () => {
		const user = table("user", {
			name: t.string(),
			age: t.number(),
		});

		expect(user.tb).toBe("user");
		expect(user._fields).toHaveProperty("name");
		expect(user._fields).toHaveProperty("age");
	});

	test("auto-generates id field", () => {
		const user = table("user", {
			name: t.string(),
		});

		const fields = user.fields;
		expect(fields).toHaveProperty("id");
		expect(fields.id.name).toBe("record");
		expect(fields.id.tb).toBe("user");
	});

	test("includes all user-defined fields", () => {
		const user = table("user", {
			name: t.string(),
			age: t.number(),
			email: t.string(),
		});

		const fields = user.fields;
		expect(fields).toHaveProperty("name");
		expect(fields).toHaveProperty("age");
		expect(fields).toHaveProperty("email");
		expect(fields).toHaveProperty("id");
	});

	test("creates schema as ObjectType", () => {
		const user = table("user", {
			name: t.string(),
		});

		const schema = user.schema;
		expect(schema.name).toBe("object");
		expect(schema.schema).toHaveProperty("name");
		expect(schema.schema).toHaveProperty("id");
	});

	test("validates records correctly", () => {
		const user = table("user", {
			name: t.string(),
			age: t.number(),
		});

		const validRecord = {
			id: new RecordId("user", "123"),
			name: "John",
			age: 30,
		};

		const invalidRecord = {
			id: new RecordId("user", "123"),
			name: "John",
			age: "thirty", // wrong type
		};

		expect(user.validate(validRecord)).toBe(true);
		expect(user.validate(invalidRecord)).toBe(false);
	});

	test("handles complex nested fields", () => {
		const user = table("user", {
			name: t.object({
				first: t.string(),
				last: t.string(),
			}),
			metadata: t.object({
				bio: t.string(),
				avatar: t.string(),
			}),
			tags: t.array(t.string()),
		});

		const validRecord = {
			id: new RecordId("user", "123"),
			name: { first: "John", last: "Doe" },
			metadata: { bio: "Developer", avatar: "avatar.jpg" },
			tags: ["dev", "typescript"],
		};

		expect(user.validate(validRecord)).toBe(true);
	});

	test("handles optional fields", () => {
		const user = table("user", {
			name: t.string(),
			nickname: t.option(t.string()),
		});

		const recordWithNickname = {
			id: new RecordId("user", "123"),
			name: "John",
			nickname: "Johnny",
		};

		const recordWithoutNickname = {
			id: new RecordId("user", "123"),
			name: "John",
			nickname: undefined,
		};

		expect(user.validate(recordWithNickname)).toBe(true);
		expect(user.validate(recordWithoutNickname)).toBe(true);
	});

	test("handles union types", () => {
		const content = table("content", {
			value: t.union([t.string(), t.number()]),
		});

		const stringRecord = {
			id: new RecordId("content", "1"),
			value: "text",
		};

		const numberRecord = {
			id: new RecordId("content", "2"),
			value: 42,
		};

		expect(content.validate(stringRecord)).toBe(true);
		expect(content.validate(numberRecord)).toBe(true);
	});

	test("handles record references", () => {
		const post = table("post", {
			title: t.string(),
			author: t.record("user"),
		});

		const validRecord = {
			id: new RecordId("post", "1"),
			title: "Hello World",
			author: new RecordId("user", "alice"),
		};

		expect(post.validate(validRecord)).toBe(true);
	});
});
