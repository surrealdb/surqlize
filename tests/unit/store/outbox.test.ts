import { describe, expect, test } from "bun:test";
import { Duration, RecordId, ServerError, Uuid } from "surrealdb";
import { applyOverlay, memoryStorage, type OutboxOp } from "../../../src";
import { decode, encode } from "../../../src/store/codec";
import { Outbox } from "../../../src/store/outbox";

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

function make(
	options: {
		send?: (op: OutboxOp) => Promise<unknown>;
		online?: () => boolean;
		storage?: ReturnType<typeof memoryStorage>;
	} = {},
) {
	const sent: OutboxOp[] = [];
	const acked: OutboxOp[] = [];
	const storage = options.storage ?? memoryStorage();
	const outbox = new Outbox({
		storage,
		send: async (op) => {
			sent.push(op);
			return options.send ? options.send(op) : { id: op.id };
		},
		acknowledge: (op) => {
			acked.push(op);
		},
		isPermanent: (e) => e instanceof ServerError || e instanceof RangeError,
		isOnline: options.online ?? (() => true),
		retry: { minMs: 5, maxMs: 20 },
	});
	return { outbox, sent, acked, storage };
}

const create = (id: string, data: Record<string, unknown> = {}): OutboxOp => ({
	table: "task",
	id,
	kind: "create",
	data,
});
const update = (id: string, data: Record<string, unknown>): OutboxOp => ({
	table: "task",
	id,
	kind: "update",
	data,
});

describe("codec", () => {
	test("round-trips what JSON loses", () => {
		const value = {
			when: new Date("2026-01-02T03:04:05.000Z"),
			ref: new RecordId("user", "tobie"),
			arrayId: new RecordId("p", [1, "a"]),
			big: 12345678901234567890n,
			nothing: undefined,
			nil: null,
			tags: ["a", { b: 1 }],
			uuid: new Uuid("018f2c80-5b77-7a52-8f1a-4a3c8c1c5d11"),
			span: new Duration("1h30m"),
			tagLike: { $t: "date", v: "not a date" },
			inf: Number.POSITIVE_INFINITY,
		};
		const back = decode(encode(value)) as typeof value;
		expect(back.when).toEqual(value.when);
		expect(back.ref).toBeInstanceOf(RecordId);
		expect(String(back.ref)).toBe(String(value.ref));
		expect(String(back.arrayId)).toBe(String(value.arrayId));
		expect(back.big).toBe(value.big);
		expect("nothing" in back && back.nothing).toBeUndefined();
		expect(back.nil).toBeNull();
		expect(back.tags).toEqual(["a", { b: 1 }]);
		expect(String(back.uuid)).toBe(String(value.uuid));
		expect(String(back.span)).toBe(String(value.span));
		expect(back.tagLike).toEqual({ $t: "date", v: "not a date" });
		expect(back.inf).toBe(Number.POSITIVE_INFINITY);
	});

	test("refuses a value it cannot store, and says where", () => {
		expect(() => encode({ a: { b: () => 1 } })).toThrow(/value\.a\.b/);
		expect(() => encode(new Map())).toThrow(/Map/);
	});
});

describe("applyOverlay", () => {
	type Row = { id: RecordId; title: string; done?: boolean };
	const row = (id: string, title: string): Row => ({
		id: new RecordId("task", id),
		title,
	});
	const key = (r: Row) => String(r.id);

	test("applies a create, an update and a delete", () => {
		const rows = [row("a", "A"), row("b", "B"), row("c", "C")];
		const out = applyOverlay(
			rows,
			[
				create("d", { title: "D" }),
				update("a", { title: "A2" }),
				{ table: "task", id: "b", kind: "delete" },
			],
			key,
			true,
		);
		expect(out.map((r) => r.title)).toEqual(["A2", "C", "D"]);
	});

	test("leaves rows that no write touches as they were", () => {
		const rows = [row("a", "A"), row("b", "B")];
		const out = applyOverlay(rows, [update("a", { title: "x" })], key, true);
		expect(out[1]).toBe(rows[1] as Row);
		expect(rows[0]?.title).toBe("A");
	});

	test("does not add a created or updated record to a filtered result", () => {
		const rows = [row("a", "A")];
		const out = applyOverlay(
			rows,
			[create("d", { title: "D" }), update("z", { title: "Z" })],
			key,
			false,
		);
		expect(out).toEqual(rows);
	});

	test("an update after a create changes the created row", () => {
		const out = applyOverlay(
			[],
			[create("d", { title: "D" }), update("d", { title: "D2" })],
			key,
			true,
		);
		expect(out.map((r) => r.title)).toEqual(["D2"]);
	});

	test("returns the same array when nothing is pending", () => {
		const rows = [row("a", "A")];
		expect(applyOverlay(rows, [], key, true)).toBe(rows);
	});
});

describe("Outbox", () => {
	test("sends writes in order, and resolves each with its result", async () => {
		const { outbox, sent, acked } = make();
		const a = outbox.enqueue(create("a"));
		const b = outbox.enqueue(create("b"));
		expect(await a).toEqual({ id: "a" });
		expect(await b).toEqual({ id: "b" });
		expect(sent.map((o) => o.id)).toEqual(["a", "b"]);
		expect(acked).toHaveLength(2);
		expect(outbox.getSnapshot()).toHaveLength(0);
	});

	test("merges updates to one record that are not sent yet", async () => {
		const { outbox, sent } = make({ online: () => false });
		void outbox.enqueue(update("a", { title: "1" }));
		void outbox.enqueue(update("a", { done: true }));
		void outbox.enqueue(update("a", { title: "3" }));
		await tick();
		expect(outbox.getSnapshot()).toHaveLength(1);
		expect(outbox.getSnapshot()[0]?.data).toEqual({ title: "3", done: true });
		expect(sent).toHaveLength(0);
	});

	test("folds an update into an unsent create, but not into a delete", async () => {
		const { outbox } = make({ online: () => false });
		void outbox.enqueue(create("a", { title: "A" }));
		void outbox.enqueue(update("a", { title: "A2" }));
		await tick();
		expect(outbox.getSnapshot()).toEqual([create("a", { title: "A2" })]);

		void outbox.enqueue({ table: "task", id: "a", kind: "delete" });
		void outbox.enqueue(update("a", { title: "A3" }));
		await tick();
		expect(outbox.getSnapshot().map((o) => o.kind)).toEqual([
			"create",
			"delete",
			"update",
		]);
	});

	test("merges an update past writes to other records, but only for that record", async () => {
		const { outbox } = make({ online: () => false });
		void outbox.enqueue(create("a", { title: "A" }));
		void outbox.enqueue(create("b", { title: "B" }));
		void outbox.enqueue(update("a", { title: "A2" }));
		await tick();
		expect(outbox.getSnapshot()).toEqual([
			create("a", { title: "A2" }),
			create("b", { title: "B" }),
		]);
	});

	test("does not send while offline, and sends everything once online", async () => {
		let online = false;
		const { outbox, sent } = make({ online: () => online });
		const a = outbox.enqueue(create("a"));
		const b = outbox.enqueue(create("b"));
		await tick(30);
		expect(sent).toHaveLength(0);
		expect(outbox.getSnapshot()).toHaveLength(2);

		online = true;
		await outbox.flush();
		await Promise.all([a, b]);
		expect(sent.map((o) => o.id)).toEqual(["a", "b"]);
	});

	test("a connection failure keeps the write and tries again", async () => {
		let attempts = 0;
		const { outbox, sent } = make({
			send: async () => {
				if (++attempts < 3) throw new Error("socket closed");
				return { ok: true };
			},
		});
		expect(await outbox.enqueue(create("a"))).toEqual({ ok: true });
		expect(sent).toHaveLength(3);
		expect(outbox.getSnapshot()).toHaveLength(0);
	});

	test("a refusal removes the write and rejects it, then the next is sent", async () => {
		const { outbox, sent } = make({
			send: async (op) => {
				if (op.id === "bad") throw new RangeError("refused");
				return {};
			},
		});
		const bad = outbox.enqueue(create("bad"));
		const good = outbox.enqueue(create("good"));
		await expect(bad).rejects.toThrow("refused");
		await good;
		expect(sent.map((o) => o.id)).toEqual(["bad", "good"]);
		expect(outbox.getSnapshot()).toHaveLength(0);
	});

	test("writes are stored until accepted, and a new outbox sends them", async () => {
		const storage = memoryStorage();
		const first = make({ storage, online: () => false });
		void first.outbox.enqueue(create("a", { title: "A", when: new Date(0) }));
		void first.outbox.enqueue(update("b", { n: 1 }));
		await tick();
		expect((await storage.load()).length).toBe(2);
		first.outbox.dispose();

		// A later session starts with what the earlier one left behind.
		const second = make({ storage });
		await second.outbox.ready;
		await tick(20);
		expect(second.sent.map((o) => o.id)).toEqual(["a", "b"]);
		expect(second.sent[0]?.data?.when).toEqual(new Date(0));
		expect((await storage.load()).length).toBe(0);
	});

	test("a write that cannot be stored is rejected and not shown", async () => {
		const storage = memoryStorage();
		storage.put = async () => {
			throw new Error("quota");
		};
		const { outbox, sent } = make({ storage });
		await expect(outbox.enqueue(create("a"))).rejects.toThrow("quota");
		expect(outbox.getSnapshot()).toHaveLength(0);
		expect(sent).toHaveLength(0);
	});

	test("the snapshot is the same array until something changes", async () => {
		const { outbox } = make({ online: () => false });
		const empty = outbox.getSnapshot();
		expect(outbox.getSnapshot()).toBe(empty);
		void outbox.enqueue(create("a"));
		await tick();
		expect(outbox.getSnapshot()).not.toBe(empty);
	});
});
