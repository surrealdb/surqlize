import { describe, expect, test } from "bun:test";
import type { Surreal } from "surrealdb";
import { api, fn, orm, t, ValidationError } from "../../../src";

const add = fn("add", [t.number(), t.option(t.number())], t.number());
const echo = api("/echo", {
	post: {
		request: t.object({ text: t.string(), n: t.number() }),
		response: t.object({ text: t.string() }),
	},
	get: { response: t.object({ text: t.string() }) },
});

/** A connection that records what reaches the SDK instead of sending it. */
function connection() {
	const sent: unknown[] = [];
	const surreal = {
		run: async (name: string, args: unknown[]) => {
			sent.push({ name, args });
			return 3;
		},
		api: () => ({
			invoke: async (path: string, req: unknown) => {
				sent.push({ path, req });
				return { status: 200, body: { text: "hi" } };
			},
		}),
	} as unknown as Surreal;
	return { surreal, sent };
}

async function thrown(p: Promise<unknown>): Promise<ValidationError> {
	try {
		await p;
	} catch (e) {
		expect(e).toBeInstanceOf(ValidationError);
		return e as ValidationError;
	}
	throw new Error("expected a ValidationError");
}

describe("db.run() argument validation", () => {
	test("is off by default", async () => {
		const { surreal, sent } = connection();
		await orm(surreal).run(add, ["x"] as never);
		expect(sent).toHaveLength(1);
	});

	test("reports every bad argument and sends nothing", async () => {
		const { surreal, sent } = connection();
		const db = orm(surreal).validated();
		const error = await thrown(db.run(add, ["x", "y"] as never));
		expect(error.issues.map((i) => i.path)).toEqual(["[0]", "[1]"]);
		expect(error.message).toContain("arguments for fn::add");
		expect(sent).toHaveLength(0);
	});

	test("rejects missing required and surplus arguments", async () => {
		const { surreal } = connection();
		const db = orm(surreal).validated();
		const missing = await thrown(db.run(add, [] as never));
		expect(missing.issues.map((i) => i.path)).toEqual(["[0]"]);
		const extra = await thrown(db.run(add, [1, 2, 3] as never));
		expect(extra.issues[0]?.path).toBe("(root)");
	});

	test("accepts valid arguments, leaving an option out", async () => {
		const { surreal, sent } = connection();
		const db = orm(surreal).validated();
		expect(await db.run(add, [1])).toBe(3);
		expect(sent).toEqual([{ name: "fn::add", args: [1] }]);
	});

	test("also validates inside a transaction", async () => {
		const { surreal } = connection();
		(surreal as unknown as Record<string, unknown>).beginTransaction =
			async () => ({
				...surreal,
				commit: async () => {},
				cancel: async () => {},
			});
		const db = orm(surreal).validated();
		await thrown(db.transaction((tx) => tx.run(add, ["x"] as never)));
	});
});

describe("db.api() request validation", () => {
	test("is off by default", async () => {
		const { surreal, sent } = connection();
		await orm(surreal)
			.api(echo)
			.post("/echo", { text: 1 } as never);
		expect(sent).toHaveLength(1);
	});

	test("reports every bad field and sends nothing", async () => {
		const { surreal, sent } = connection();
		const client = orm(surreal).validated().api(echo);
		const error = await thrown(client.post("/echo", {} as never));
		expect(error.issues.map((i) => i.path)).toEqual(["text", "n"]);
		expect(error.message).toContain("request body for POST /echo");
		expect(sent).toHaveLength(0);
	});

	test("accepts a valid body and skips methods without a request type", async () => {
		const { surreal, sent } = connection();
		const client = orm(surreal).validated().api(echo);
		await client.post("/echo", { text: "a", n: 1 });
		await client.get("/echo");
		expect(sent).toHaveLength(2);
	});
});

describe("Standard Schema", () => {
	test("every type validates through ~standard, reporting each issue with a path", () => {
		const schema = t.object({
			name: t.string(),
			tags: t.array(t.number()),
		});
		const ok = schema["~standard"].validate({ name: "a", tags: [1] });
		expect(ok.issues).toBeUndefined();

		const bad = schema["~standard"].validate({ name: 1, tags: [1, "x"] });
		expect(bad.issues?.map((i) => i.path)).toEqual([["name"], ["tags", 1]]);
		expect(bad.issues?.[0]?.message).toBe("expected string, received 1");
		expect(schema["~standard"].vendor).toBe("surqlize");
	});

	test("a bare value reports an empty path", () => {
		const bad = t.number()["~standard"].validate("x");
		expect(bad.issues?.[0]?.path).toEqual([]);
	});
});
