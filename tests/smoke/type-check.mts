import { orm, t, table } from "surqlize";
import { type RecordId, Surreal } from "surrealdb";

// Strict, invariant type-equality check (not mere assignability), so the
// assertions below fail if an inferred shape drifts in *either* direction —
// a missing or extra field is caught, not just an incompatible one.
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
type Expect<T extends true> = T;

const user = table("user", {
	name: t.string(),
	age: t.number(),
});

const db = orm(new Surreal(), user);
const query = db
	.select("user")
	.where((f) => f.age.gte(18))
	.return((f) => ({ name: f.name }));

type QueryResult = t.infer<typeof query>;
type UserRecord = (typeof user)["type"];

// The packaged declarations must parse *and* infer these exact shapes.
type _AssertQuery = Expect<Equal<QueryResult, { name: string }[]>>;
type _AssertUser = Expect<
	Equal<UserRecord, { id: RecordId<"user">; name: string; age: number }>
>;

void (null as _AssertQuery | _AssertUser | null);
