const { table, orm, t } = require("surqlize");
const { Surreal } = require("surrealdb");

const user = table("user", { name: t.string(), age: t.number() });
const db = orm(new Surreal(), user);
const _query = db.select("user").where((f) => f.age.gte(18));
console.log("node-cjs: ok");
