import { orm, t, table } from "surqlize";
import { Surreal } from "surrealdb";

const user = table("user", { name: t.string(), age: t.number() });
const db = orm(new Surreal(), user);
const _query = db.select("user").where((f) => f.age.gte(18));
console.log("deno-esm: ok");
