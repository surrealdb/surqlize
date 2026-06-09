# Statements: ALTER, REMOVE, REBUILD, INFO, USE, OPTION

Source coverage: `statements/alter`, `remove`, `rebuild`, `info`, `use`, `option`, parameterized schema tests.

```surql
ALTER DATABASE COMPACT;
ALTER TABLE test COMPACT;
ALTER INDEX a ON b COMMENT "idx";
ALTER SYSTEM QUERY_TIMEOUT 1s;
ALTER FIELD data[$idx] ON TABLE thing COMMENT "altered";
ALTER PARAM $test VALUE 100 COMMENT "updated param";
ALTER SEQUENCE seq TIMEOUT 5s;
ALTER ACCESS my_access ON DATABASE COMMENT "updated";
ALTER ANALYZER my_analyzer COMMENT "updated";
ALTER CONFIG GRAPHQL TABLES AUTO FUNCTIONS NONE;
ALTER CONFIG DEFAULT NAMESPACE test DATABASE testdb;
ALTER BUCKET mybucket READONLY COMMENT "updated bucket" PERMISSIONS NONE;

REMOVE TABLE foo;
REMOVE FIELD age ON person;
REMOVE INDEX ft_name ON person;
REMOVE ACCESS my_access ON DATABASE;
REMOVE ANALYZER simple;
REMOVE DATABASE test;
REMOVE EVENT on_create ON person;
REMOVE FUNCTION fn::shout;
REMOVE NAMESPACE test;
REMOVE PARAM $host;
REMOVE USER root ON ROOT;
REMOVE CONFIG GRAPHQL;
REMOVE API "/hello";
REMOVE SEQUENCE order_id;
REMOVE BUCKET media;
REMOVE MODEL ml::classifier<1.0.0>;
REBUILD INDEX idx ON t;
REBUILD INDEX idx ON t CONCURRENTLY;

INFO FOR ROOT;
INFO FOR DB STRUCTURE;
INFO FOR USER foo ON DB;
USE NS ns DB db;
OPTION IMPORT;
OPTION IMPORT = false;
```

```ts
db.alter.database().compact();
db.alter.table("test").compact();
db.alter.index("a").on("b").comment("idx");
db.alter.system().queryTimeout("1s");
db.alter.field(q.field("data").index(q.param("idx"))).on("thing").comment("altered");
db.alter.param("test").value(100).comment("updated param");
db.alter.sequence("seq").timeout("5s");
db.alter.access("my_access").on("DATABASE").comment("updated");
db.alter.analyzer("my_analyzer").comment("updated");
db.alter.config("GRAPHQL").tables.auto().functions.none();
db.alter.config("DEFAULT").namespace("test").database("testdb");
db.alter.bucket("mybucket").readonly().comment("updated bucket").permissions("NONE");

db.remove.table("foo");
db.remove.field("age").on("person");
db.remove.index("ft_name").on("person");
db.remove.access("my_access").on("DATABASE");
db.remove.analyzer("simple");
db.remove.database("test");
db.remove.event("on_create").on("person");
db.remove.function("shout");
db.remove.namespace("test");
db.remove.param("host");
db.remove.user("root").on("ROOT");
db.remove.config("GRAPHQL");
db.remove.api("/hello");
db.remove.sequence("order_id");
db.remove.bucket("media");
db.remove.model("classifier", "1.0.0");
db.rebuild.index("idx").on("t");
db.rebuild.index("idx").on("t").concurrently();

db.info.root();
db.info.db().structure();
db.info.user("foo").on("DB");
db.use({ ns: "ns", db: "db" });
db.option("IMPORT");
db.option("IMPORT", false);
```

API implications:

- Admin statements should not be second-class raw strings, but may start with broad resource builders.
- `INFO` output types differ heavily by scope; encode scope in the builder.
- Resource names can be parameters or expressions in parameterized schema tests, so builders need `IntoExpr<Name>` inputs.
