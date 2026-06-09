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

	test("multi-table edge wires every source and target", () => {
		const post = table("post", { title: t.string() });
		const user = table("user", { name: t.string() });
		const tag = table("tag", { label: t.string() });
		const topic = table("topic", { name: t.string() });
		const tagged = edge(["post", "user"], "tagged", ["tag", "topic"], {});

		const lookup = createLookupFromSchemas([post, user, tag, topic, tagged]);

		// Every source connects to the edge...
		expect(lookup.to.post).toContain("tagged");
		expect(lookup.to.user).toContain("tagged");
		// ...and the edge connects to every target.
		expect(lookup.to.tagged).toContain("tag");
		expect(lookup.to.tagged).toContain("topic");

		// From direction is the mirror image.
		expect(lookup.from.tag).toContain("tagged");
		expect(lookup.from.topic).toContain("tagged");
		expect(lookup.from.tagged).toContain("post");
		expect(lookup.from.tagged).toContain("user");

		// No array-stringified key (e.g. "post,user") leaks into the maps.
		expect(Object.keys(lookup.to)).not.toContain("post,user");
		expect(Object.keys(lookup.from)).not.toContain("tag,topic");
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
