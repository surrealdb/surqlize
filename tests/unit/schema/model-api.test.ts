import { describe, expect, test } from "bun:test";
import { RecordId, type SurrealSession } from "surrealdb";
import { type HydrationInput, OrmError, orm, t, table } from "../../../src";
import { toPlainModel } from "../../../src/utils/model";

const profile = table("profile", { name: t.string() });

class Profile extends profile.model() {
	static hydrate(record: HydrationInput<typeof profile.schema>) {
		return Object.assign(new Profile(), record);
	}
}

const user = table("user", {
	name: t.string(),
	email: t.string(),
	profile: t.option(t.record("profile")),
	profiles: t.array(t.record("profile")),
});

class User extends user.model() {
	static constructions = 0;
	#label = "User: ";
	readonly upperName = () => this.name.toUpperCase();

	constructor() {
		super();
		User.constructions += 1;
	}

	static hydrate(record: HydrationInput<typeof user.schema>) {
		return Object.assign(new User(), record);
	}

	static findByEmail(email: string): Promise<User | undefined> {
		// biome-ignore lint/complexity/noThisInStatic: bound subclasses select through their own ORM.
		return this.select()
			.where((row) => row.email.eq(email))
			.then.val();
	}

	static fromRaw(record: HydrationInput<typeof user.schema>) {
		return Object.assign(new User(), record);
	}

	get label() {
		return `${this.#label}${this.name}`;
	}

	rename(name: string) {
		return this.update().set({ name });
	}
}

type _UserName = Expect<Equal<InstanceType<typeof User>["name"], string>>;
type _UserLabel = Expect<Equal<InstanceType<typeof User>["label"], string>>;
void (null as _UserName | _UserLabel | null);

const attachedUser = user.attach(User);
const attachedProfile = profile.attach(Profile);

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
type Expect<T extends true> = T;

function createDb(commitFails = false, cancelFails = false) {
	const calls: { query: string; variables: Record<string, unknown> }[] = [];
	const transactionCalls = { commit: 0, cancel: 0 };
	const commitError = new Error("commit failed");
	const cancelError = new Error("cancel failed");
	const rawUser = {
		id: new RecordId("user", "ada"),
		name: "Ada",
		email: "ada@example.com",
		profile: new RecordId("profile", "p1"),
		profiles: [new RecordId("profile", "p1")],
	};
	let transaction: unknown;
	let session: unknown;
	transaction = {
		query: async (query: string, variables: Record<string, unknown> = {}) => {
			calls.push({ query, variables });
			if (query.startsWith("(DELETE")) return [[]];
			return [[rawUser]];
		},
		withSignal: () => transaction,
		commit: async () => {
			transactionCalls.commit += 1;
			if (commitFails) throw commitError;
		},
		cancel: async () => {
			transactionCalls.cancel += 1;
			if (cancelFails) throw cancelError;
		},
	};
	session = {
		query: async (query: string, variables: Record<string, unknown> = {}) => {
			calls.push({ query, variables });
			if (query.startsWith("(DELETE")) return [[]];
			return [[rawUser]];
		},
		withSignal: () => session,
		beginTransaction: async () => transaction,
	};
	const db = orm(session as SurrealSession, attachedUser, attachedProfile);
	return { db, calls, rawUser, transactionCalls, commitError, cancelError };
}

describe("ORM-bound model API", () => {
	test("attaches immutably while preserving schema modifiers and old class links", () => {
		const measured = table("measured", { name: t.string() })
			.computed("label", t.string(), (row) => row.name)
			.comment("model metadata");
		class Measured extends measured.model() {
			static hydrate(record: HydrationInput<typeof measured.schema>) {
				return Object.assign(new Measured(), record);
			}
		}
		const linked = measured.attach(Measured);

		expect(linked).not.toBe(measured);
		expect(linked._fields).toBe(measured._fields);
		expect(linked.attachedModel).toBe(Measured);
		expect(linked.computedFields).toEqual(["label"]);
		expect(linked.ddl).toBe(measured.ddl);

		class Legacy {
			static constructions = 0;
			constructor() {
				Legacy.constructions += 1;
			}
		}
		const legacy = table("legacy", { name: t.string() }, Legacy);
		const legacyRow = legacy.schema.parse({
			id: new RecordId("legacy", "l1"),
			name: "Old API",
		});
		expect(legacyRow).toBeInstanceOf(Legacy);
		expect(Legacy.constructions).toBe(0);
	});

	test("creates and caches a model constructor with typed static queries", async () => {
		const { db } = createDb();
		const UserModel = db.model("user");

		expect(db.model("user")).toBe(UserModel);
		expect(UserModel).not.toBe(User);

		const selected = UserModel.select();
		selected.where((row) => row.email.eq("ada@example.com"));
		UserModel.create().content({
			name: "Ada",
			email: "ada@example.com",
			profiles: [],
		});
		UserModel.insert({ name: "Ada", email: "ada@example.com" });
		UserModel.update().set({ name: "Augusta" });
		UserModel.upsert().set({ name: "Ada" });
		UserModel.delete().return("before");

		const result: Promise<User | undefined> =
			UserModel.findByEmail("ada@example.com");
		expect((await result)?.$orm).toBe(db);
	});

	test("hydrates once, initializes private state and binds model helpers", async () => {
		const { db, calls, rawUser } = createDb();
		const UserModel = db.model("user");
		User.constructions = 0;

		const [record] = UserModel.select().parseResult([rawUser]);
		expect(record).toBeInstanceOf(User);
		expect(User.constructions).toBe(1);
		expect(record!.label).toBe("User: Ada");
		expect(record!.upperName()).toBe("ADA");
		expect(record!.$orm).toBe(db);
		expect(Object.hasOwn(record!, "$orm")).toBe(false);

		await record!.select();
		await record!.rename("Augusta");
		await record!.delete();
		for (const call of calls) {
			expect(Object.values(call.variables)).toContain(record!.id);
		}
	});

	test("keeps ORM statics on the bound facade and instance helpers on parsed rows", async () => {
		const first = createDb();
		const second = createDb();
		const firstModel = first.db.model("user");
		const secondModel = second.db.model("user");
		const [firstRow] = firstModel.select().parseResult([first.rawUser]);
		const [secondRow] = secondModel.select().parseResult([second.rawUser]);

		expect(firstModel).not.toBe(secondModel);
		expect(firstRow).toBeInstanceOf(User);
		expect(firstRow!.constructor).toBe(User);
		expect(firstRow!.$orm).toBe(first.db);
		expect(secondRow!.$orm).toBe(second.db);
		expect(() => User.findByEmail("ada@example.com")).toThrow(OrmError);
		expect(() =>
			(firstRow!.constructor as typeof User).findByEmail("ada@example.com"),
		).toThrow(OrmError);

		const firstStaticResult = await firstModel.findByEmail("ada@example.com");
		const secondStaticResult = await secondModel.findByEmail("ada@example.com");
		expect(firstStaticResult!.$orm).toBe(first.db);
		expect(secondStaticResult!.$orm).toBe(second.db);

		await firstRow!.select();
		await secondRow!.select();
		expect(first.calls).toHaveLength(2);
		expect(second.calls).toHaveLength(2);
	});

	test("binds models parsed through the public parse method", () => {
		const { db, calls, rawUser } = createDb();
		const [record] = db.model("user").select().parse([rawUser]);

		expect(record).toBeInstanceOf(User);
		expect(record!.label).toBe("User: Ada");
		expect(record!.upperName()).toBe("ADA");
		expect(record!.$orm).toBe(db);
		expect(record!.select()).toBeDefined();
		expect(record!.rename("Augusta")).toBeDefined();

		const rawProfile = {
			id: new RecordId("profile", "p1"),
			name: "Countess",
		};
		const [withFetchedProfile] = db
			.select("user")
			.fetch("profile", "profiles")
			.parse([{ ...rawUser, profile: rawProfile, profiles: [rawProfile] }]);

		expect(withFetchedProfile!.$orm).toBe(db);
		expect(withFetchedProfile!.profile?.$orm).toBe(db);
		expect(withFetchedProfile!.profiles[0]!.$orm).toBe(db);
		expect(calls).toHaveLength(0);
	});

	test("binds nested FETCH models and leaves projections plain", () => {
		const { db, rawUser } = createDb();
		const rawProfile = {
			id: new RecordId("profile", "p1"),
			name: "Countess",
		};
		const [record] = db
			.select("user")
			.fetch("profile", "profiles")
			.parseResult([
				{ ...rawUser, profile: rawProfile, profiles: [rawProfile] },
			]);

		expect(record).toBeInstanceOf(User);
		expect(record!.profile).toBeInstanceOf(Profile);
		expect(record!.profile?.$orm).toBe(db);
		expect(record!.profiles[0]).toBeInstanceOf(Profile);
		expect(record!.profiles[0]!.$orm).toBe(db);

		const [projection] = db
			.select("user")
			.return((row) => ({ email: row.email }))
			.parseResult([{ email: "ada@example.com" }]);
		expect(projection).not.toBeInstanceOf(User);
		expect(projection).toEqual({ email: "ada@example.com" });
	});

	test("binds direct factories to their ORM and serializes only record data", () => {
		const first = createDb();
		const second = createDb();
		const firstModel = first.db.model("user");
		const secondModel = second.db.model("user");
		const firstRecord = firstModel.hydrate(first.rawUser);
		const secondRecord = secondModel.hydrate(second.rawUser);

		expect(firstModel).not.toBe(secondModel);
		expect(firstRecord.$orm).toBe(first.db);
		expect(secondRecord.$orm).toBe(second.db);
		expect(firstModel.fromRaw(first.rawUser).$orm).toBe(first.db);
		expect(toPlainModel(firstRecord)).toEqual(first.rawUser);
		expect(Object.keys(firstRecord)).toContain("upperName");
		expect(Object.keys(toPlainModel(firstRecord) as object)).not.toContain(
			"upperName",
		);
	});

	test("preserves request scope and transaction lifecycle across aliases", async () => {
		const { db, rawUser } = createDb();
		const scoped = db.withSignal(new AbortController().signal).validated();
		const scopedRecord = scoped.model("user").hydrate(rawUser);
		expect(scopedRecord.$orm).toBe(scoped);

		const tx = await db.transaction();
		const alias = tx.withSignal(new AbortController().signal).validated();
		const [committedRecord] = alias
			.model("user")
			.select()
			.parseResult([rawUser]);
		expect(committedRecord!.$orm).toBe(alias);
		await tx.commit();
		expect(committedRecord!.$orm).toBe(db);
		expect(await committedRecord!.select()).toBeDefined();
		await expect(tx.cancel()).rejects.toThrow("already completed");

		const rollback = await db.transaction();
		const [cancelledRecord] = rollback
			.validated()
			.model("user")
			.select()
			.parseResult([rawUser]);
		await rollback.withSignal(undefined).cancel();
		expect(() => cancelledRecord!.$orm).toThrow(
			"completed or cancelled transaction",
		);
		expect(() => cancelledRecord!.update()).toThrow(OrmError);
	});

	test("invalidates models after a failed commit", async () => {
		const { db, rawUser, transactionCalls, commitError } = createDb(true);
		const tx = await db.transaction();
		const [record] = tx.model("user").select().parseResult([rawUser]);

		await expect(tx.commit()).rejects.toBe(commitError);
		expect(() => record!.$orm).toThrow("completed or cancelled transaction");
		await Promise.all([
			tx.withSignal(new AbortController().signal).validated().cancel(),
			tx.validated().cancel(),
		]);
		await tx.cancel();
		expect(transactionCalls).toEqual({ commit: 1, cancel: 1 });
		expect(() => record!.$orm).toThrow("completed or cancelled transaction");
	});

	test("callback transactions preserve the original error when cleanup fails", async () => {
		const commitFailure = createDb(true, true);
		await expect(
			commitFailure.db.transaction(async () => undefined),
		).rejects.toBe(commitFailure.commitError);
		expect(commitFailure.transactionCalls).toEqual({ commit: 1, cancel: 1 });

		const callbackFailure = createDb(false, true);
		const callbackError = new Error("callback failed");
		await expect(
			callbackFailure.db.transaction(async () => {
				throw callbackError;
			}),
		).rejects.toBe(callbackError);
		expect(callbackFailure.transactionCalls).toEqual({ commit: 0, cancel: 1 });
	});

	test("invalidates escaped models even when manual cancellation fails", async () => {
		const { db, rawUser, cancelError, transactionCalls } = createDb(
			false,
			true,
		);
		const tx = await db.transaction();
		const [record] = tx.model("user").select().parseResult([rawUser]);

		await expect(tx.cancel()).rejects.toBe(cancelError);
		await tx.withSignal(undefined).validated().cancel();
		expect(transactionCalls.cancel).toBe(1);
		expect(() => record!.$orm).toThrow("completed or cancelled transaction");
	});

	test("rejects unbound records, bad IDs and reserved row fields", () => {
		const { db, rawUser } = createDb();
		const unbound = User.fromRaw(rawUser);
		expect(() => unbound.$orm).toThrow(OrmError);

		const model = db.model("user");
		const badId = model.hydrate({
			...rawUser,
			id: new RecordId("profile", "p1"),
		} as unknown as HydrationInput<typeof user.schema>);
		expect(() => badId.select()).toThrow("valid record ID");
		expect(() =>
			model.select().parseResult([{ ...rawUser, update: "shadow" }]),
		).toThrow('field "update" is reserved');

		const reserved = table("reserved", { update: t.string() });
		class Reserved extends reserved.model() {
			static hydrate(record: HydrationInput<typeof reserved.schema>) {
				return Object.assign(new Reserved(), record);
			}
		}
		expect(() => {
			// @ts-expect-error reserved record fields cannot be attached to model helpers
			reserved.attach(Reserved);
		}).toThrow(OrmError);
	});
});

const typingDb = createDb().db;
const typingModel = typingDb.model("user");
const customStaticResult: Promise<User | undefined> =
	null as unknown as ReturnType<typeof typingModel.findByEmail>;
void customStaticResult;

function checkModelTypes() {
	const fetchedProfile: Profile | undefined = typingDb
		.select("user")
		.fetch("profile").type[0]?.profile;
	void fetchedProfile;

	const callbackResult: Promise<User | undefined> = typingDb.transaction(
		async (tx) => tx.model("user").findByEmail("ada@example.com"),
	);
	const instanceResult: Promise<User | undefined> = typingModel
		.hydrate({
			id: new RecordId("user", "typed"),
			name: "Ada",
			email: "ada@example.com",
			profile: undefined,
			profiles: [],
		})
		.select()
		.where((row) => row.email.eq("ada@example.com"))
		.then.val();
	void callbackResult;
	void instanceResult;

	// @ts-expect-error a table without a model has no bound model constructor
	typingDb.model("missing");
	// @ts-expect-error a model base cannot be attached to a different table
	profile.attach(User);
	// @ts-expect-error model getters are not writable schema fields
	typingModel.update().content({ label: "wrong" });
	// @ts-expect-error model methods are not writable schema fields
	typingModel.update().content({ rename: () => undefined });
}
void checkModelTypes;

const reservedType = table("reservedType", { select: t.string() });
class ReservedType extends reservedType.model() {
	static hydrate(record: HydrationInput<typeof reservedType.schema>) {
		return Object.assign(new ReservedType(), record);
	}
}
function checkReservedModelType() {
	// @ts-expect-error record fields cannot shadow model instance helpers
	reservedType.attach(ReservedType);
}
void checkReservedModelType;
