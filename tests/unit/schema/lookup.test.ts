import { describe, expect, test } from "bun:test";
import { edge, t, table } from "../../../src";
import { createLookupFromSchemas } from "../../../src/schema/lookup";

describe("createLookupFromSchemas", () => {
	test("tables only have empty to/from arrays", () => {
		const user = table("user", { name: t.string() });
		const post = table("post", { title: t.string() });

		const lookup = createLookupFromSchemas([user, post]);

		expect(lookup.to.user).toEqual([]);
		expect(lookup.to.post).toEqual([]);
		expect(lookup.from.user).toEqual([]);
		expect(lookup.from.post).toEqual([]);
	});

	test("single edge creates correct to/from connections", () => {
		const user = table("user", { name: t.string() });
		const post = table("post", { title: t.string() });
		const authored = edge("user", "authored", "post", {
			created: t.date(),
		});

		const lookup = createLookupFromSchemas([user, post, authored]);

		// To direction: user -> authored -> post
		expect(lookup.to.user).toContain("authored");
		expect(lookup.to.authored).toContain("post");
		expect(lookup.to.post).toEqual([]);

		// From direction: post -> authored -> user
		expect(lookup.from.post).toContain("authored");
		expect(lookup.from.authored).toContain("user");
		expect(lookup.from.user).toEqual([]);
	});

	test("multiple edges create correct connections", () => {
		const user = table("user", { name: t.string() });
		const post = table("post", { title: t.string() });
		const comment = table("comment", { body: t.string() });
		const authored = edge("user", "authored", "post", {});
		const commented = edge("user", "commented", "comment", {});

		const lookup = createLookupFromSchemas([
			user,
			post,
			comment,
			authored,
			commented,
		]);

		// User connects to both edges
		expect(lookup.to.user).toContain("authored");
		expect(lookup.to.user).toContain("commented");
	});

	test("self-referential edge works correctly", () => {
		const user = table("user", { name: t.string() });
		const follows = edge("user", "follows", "user", {});

		const lookup = createLookupFromSchemas([user, follows]);

		// To: user -> follows -> user
		expect(lookup.to.user).toContain("follows");
		expect(lookup.to.follows).toContain("user");

		// From: user -> follows -> user
		expect(lookup.from.user).toContain("follows");
		expect(lookup.from.follows).toContain("user");
	});

	test("empty input returns empty lookup", () => {
		const lookup = createLookupFromSchemas([]);

		expect(lookup.to).toEqual({});
		expect(lookup.from).toEqual({});
	});

	test("edge-only schemas create nodes for from, via, and to", () => {
		const authored = edge("user", "authored", "post", {});

		const lookup = createLookupFromSchemas([authored]);

		expect(lookup.to).toHaveProperty("user");
		expect(lookup.to).toHaveProperty("authored");
		expect(lookup.to).toHaveProperty("post");
		expect(lookup.from).toHaveProperty("user");
		expect(lookup.from).toHaveProperty("authored");
		expect(lookup.from).toHaveProperty("post");
	});
});
