import { describe, expect, test } from "bun:test";
import { edge, mermaid, t, table } from "../../../src";

/** The lines of a diagram, trimmed, with blanks dropped. */
function lines(diagram: string): string[] {
	return diagram
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

/** Only the relationship arrows. */
function arrows(diagram: string): string[] {
	return lines(diagram).filter((line) => line.includes(" : "));
}

describe("Diagram structure", () => {
	test("always opens with erDiagram", () => {
		expect(mermaid([]).startsWith("erDiagram")).toBe(true);
	});

	test("renders an entity block per table", () => {
		const diagram = mermaid([
			table("user", { name: t.string() }),
			table("post", { title: t.string() }),
		]);

		expect(diagram).toContain("user {");
		expect(diagram).toContain("post {");
		expect(diagram).toContain("string name");
		expect(diagram).toContain("string title");
	});

	test("renders an empty table as an empty block", () => {
		// The injected id is the only row
		expect(mermaid([table("empty", {})])).toContain("empty {");
	});
});

describe("Relationships", () => {
	test("infers a link from a record field, labelled with the field", () => {
		const diagram = mermaid([
			table("post", { author: t.record("user") }),
			table("user", { name: t.string() }),
		]);

		expect(arrows(diagram)).toContain('post }o--|| user : "author"');
	});

	test("draws an explicit edge, labelled with the edge table", () => {
		const diagram = mermaid([
			table("user", { name: t.string() }),
			table("post", { title: t.string() }),
			edge("user", "authored", "post", {}),
		]);

		expect(arrows(diagram)).toContain('user }o--|| post : "authored"');
	});

	test("fans a union link out into one arrow per target", () => {
		const diagram = mermaid([
			table("report", { context: t.record(["post", "comment"]) }),
		]);

		expect(arrows(diagram)).toContain('report }o--|| post : "context"');
		expect(arrows(diagram)).toContain('report }o--|| comment : "context"');
	});

	test("expands an edge across every source and target", () => {
		const diagram = mermaid([edge(["post", "user"], "tagged", "tag", {})]);

		expect(arrows(diagram)).toContain('post }o--|| tag : "tagged"');
		expect(arrows(diagram)).toContain('user }o--|| tag : "tagged"');
	});

	test("draws one arrow per field, not per target table", () => {
		// Two fields pointing at the same table is two relationships
		const diagram = mermaid([
			table("post", { author: t.record("user"), reviewer: t.record("user") }),
		]);

		expect(arrows(diagram).filter((a) => a.includes("user"))).toHaveLength(2);
	});

	test("draws self-references", () => {
		const diagram = mermaid([
			table("user", { followers: t.array(t.record("user")) }),
		]);

		expect(arrows(diagram)).toContain('user ||--o{ user : "followers"');
	});

	test("draws nothing for a record with no named table", () => {
		const diagram = mermaid([table("report", { subject: t.record() })]);

		expect(arrows(diagram)).toEqual([]);
		expect(diagram).toContain("record subject");
	});

	test("never links through id, in or out", () => {
		// The injected `id` is `record<tb>`; reading it as a link would draw a
		// self-reference on every table, and an edge's in/out are already drawn.
		const diagram = mermaid([
			table("user", { name: t.string() }),
			table("post", { title: t.string() }),
			edge("user", "authored", "post", {}),
		]);

		expect(arrows(diagram)).toEqual(['user }o--|| post : "authored"']);
	});
});

describe("Cardinality", () => {
	test("a plain link is many-to-one", () => {
		const diagram = mermaid([table("post", { author: t.record("user") })]);
		expect(arrows(diagram)[0]).toContain("}o--||");
	});

	test("an optional link is many-to-optional-one", () => {
		const diagram = mermaid([
			table("post", { editor: t.option(t.record("user")) }),
		]);
		expect(arrows(diagram)[0]).toContain("}o--o|");
	});

	test("a collection link is one-to-many", () => {
		const diagram = mermaid([
			table("post", { tags: t.array(t.record("tag")) }),
		]);
		expect(arrows(diagram)[0]).toContain("||--o{");
	});

	test("an optional collection is distinguishable from a required one", () => {
		// smig had both arms of this branch identical
		const required = mermaid([
			table("post", { tags: t.array(t.record("tag")) }),
		]);
		const optional = mermaid([
			table("post", { tags: t.option(t.array(t.record("tag"))) }),
		]);

		expect(arrows(required)[0]).not.toBe(arrows(optional)[0]);
		expect(arrows(optional)[0]).toContain("|o--o{");
	});

	test("an edge carrying a collection is one-to-many", () => {
		const plain = mermaid([edge("user", "rel", "post", { at: t.date() })]);
		const collection = mermaid([
			edge("user", "rel", "post", { notes: t.array(t.string()) }),
		]);

		expect(arrows(plain)[0]).toContain("}o--||");
		expect(arrows(collection)[0]).toContain("||--o{");
	});
});

describe("Type display", () => {
	test("unwraps option to the type inside", () => {
		const diagram = mermaid([
			table("t", { a: t.option(t.string()), b: t.option(t.int()) }),
		]);

		expect(diagram).toContain("string a");
		expect(diagram).toContain("int b");
	});

	test("collapses collections and links to a word", () => {
		const diagram = mermaid([
			table("t", {
				list: t.array(t.string()),
				unique: t.set(t.string()),
				link: t.record("user"),
				nested: t.array(t.record("item")),
			}),
		]);

		expect(diagram).toContain("array list");
		expect(diagram).toContain("set unique");
		expect(diagram).toContain("record link");
		expect(diagram).toContain("array nested");
	});

	test("shows widths and formats as how they read", () => {
		const diagram = mermaid([
			table("t", {
				f: t.float(),
				d: t.decimal(),
				u: t.uuid(),
				dur: t.duration(),
				i: t.int(),
				g: t.geometry("point"),
			}),
		]);

		expect(diagram).toContain("number f");
		expect(diagram).toContain("number d");
		expect(diagram).toContain("string u");
		expect(diagram).toContain("string dur");
		expect(diagram).toContain("int i");
		expect(diagram).toContain("geometry g");
	});
});

describe("Nested fields", () => {
	test("underscores dotted names in rows but keeps dots in labels", () => {
		// Mermaid's attribute token rejects dots; relationship labels accept them.
		const diagram = mermaid([
			table("post", {
				votes: t.object({ positive: t.array(t.record("user")) }),
			}),
		]);

		expect(diagram).toContain("array votes_positive");
		expect(arrows(diagram)[0]).toContain('"votes.positive"');
	});

	test("renders the parent object and its children", () => {
		const diagram = mermaid([
			table("person", { address: t.object({ street: t.string() }) }),
		]);

		expect(diagram).toContain("object address");
		expect(diagram).toContain("string address_street");
	});
});

describe("Minimal annotations", () => {
	test("marks a unique-indexed field UK", () => {
		// smig sniffed for the word UNIQUE in an assert; the index is authoritative
		const diagram = mermaid([
			table("user", { email: t.string() }).index("email_uq", {
				fields: ["email"],
				unique: true,
			}),
		]);

		expect(diagram).toContain("string email UK");
	});

	test("marks id as PK", () => {
		expect(mermaid([table("user", { name: t.string() })])).toContain(
			"record id PK",
		);
	});

	test("summarises length and range constraints", () => {
		const diagram = mermaid([
			table("t", {
				name: t
					.string()
					.assert("string::len($value) >= 3")
					.assert("string::len($value) <= 20"),
				age: t.int().assert("$value >= 0").assert("$value <= 150"),
			}),
		]);

		expect(diagram).toContain('"3-20 chars"');
		expect(diagram).toContain('"0-150"');
	});

	test("recognises email and pattern asserts", () => {
		const diagram = mermaid([
			table("t", {
				email: t.string().assert("string::is_email($value)"),
				code: t.string().assert("$value ~ /^[A-Z]{3}$/"),
			}),
		]);

		expect(diagram).toContain('"email"');
		expect(diagram).toContain('"pattern"');
	});

	test("says nothing about defaults or comments", () => {
		const diagram = mermaid([
			table("t", { a: t.bool().default(true).comment("Note") }),
		]);

		expect(diagram).not.toContain("default");
		expect(diagram).not.toContain("Note");
	});
});

describe("Detailed annotations", () => {
	const detailed = { level: "detailed" as const };

	test("shows defaults", () => {
		const diagram = mermaid(
			[
				table("t", {
					a: t.bool().default(true),
					b: t.int().default(0),
					c: t.string().default("user"),
					d: t.array(t.string()).default([]),
				}),
			],
			detailed,
		);

		expect(diagram).toContain("default: true");
		expect(diagram).toContain("default: 0");
		expect(diagram).toContain("default: 'user'");
		expect(diagram).toContain("default: []");
	});

	test("distinguishes a computed field from a value expression", () => {
		const diagram = mermaid(
			[
				table("t", {
					a: t.int().computed("1 + 1"),
					b: t.date().valueExpr("time::now()"),
				}),
			],
			detailed,
		);

		expect(diagram).toContain("computed");
		expect(diagram).toContain("value: time::now()");
	});

	test("shows readonly and comments", () => {
		const diagram = mermaid(
			[table("t", { a: t.string().readonly().comment("A note") })],
			detailed,
		);

		expect(diagram).toContain("readonly");
		expect(diagram).toContain("A note");
	});

	test("truncates a long comment", () => {
		const diagram = mermaid(
			[table("t", { a: t.string().comment("x".repeat(60)) })],
			detailed,
		);

		expect(diagram).toContain("...");
		expect(diagram).not.toContain("x".repeat(60));
	});

	test("combines annotations into one quoted blob", () => {
		const diagram = mermaid(
			[table("t", { a: t.bool().default(true).comment("Status") })],
			detailed,
		);

		expect(diagram).toContain('"default: true; Status"');
	});

	test("includeComments false drops only the comment", () => {
		const diagram = mermaid(
			[table("t", { a: t.bool().default(true).comment("Status") })],
			{ level: "detailed", includeComments: false },
		);

		expect(diagram).toContain("default: true");
		expect(diagram).not.toContain("Status");
	});

	test("carries more than minimal for the same schema", () => {
		const schema = [
			table("t", { a: t.bool().default(true).comment("Status") }),
		];

		expect(mermaid(schema, detailed).length).toBeGreaterThan(
			mermaid(schema).length,
		);
	});
});
