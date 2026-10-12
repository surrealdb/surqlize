import { orm, type TableFields, type TableSchema, t, table } from "surqlize";
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

// A table linked to a class: `ModelType` is not exported, but the declarations
// that mention it must still be valid and infer the instance type.
class Account {
	name!: string;
	shout() {
		return this.name.toUpperCase();
	}
}
const account = table("account", { name: t.string() }, Account);
type _AssertModel = Expect<
	Equal<ReturnType<(typeof account)["type"]["shout"]>, string>
>;

// A specific table is assignable to the wider table types.
const _bare: TableSchema = user;
const _wide: TableSchema<string, TableFields> = user;
const _linked: TableSchema = account;
void [_bare, _wide, _linked];

void (null as _AssertQuery | _AssertUser | _AssertModel | null);
