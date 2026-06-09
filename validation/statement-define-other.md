# Statements: DEFINE Other Resources

Source coverage: `statements/define/analyzer`, `api`, `bucket`, `config`, `database`, `event`, `function`, `module`, `namespace`, `param`, `sequence`, `user`, access tests, model SQL structs.

```surql
DEFINE NAMESPACE test;
DEFINE DATABASE test;
DEFINE PARAM $host VALUE "localhost" PERMISSIONS FULL;
DEFINE FUNCTION fn::shout($text: string) { RETURN string::uppercase($text); };
DEFINE EVENT on_create ON TABLE person WHEN $event = "CREATE" THEN CREATE audit SET record = $after.id;
DEFINE ANALYZER simple TOKENIZERS blank,class FILTERS lowercase;
DEFINE SEQUENCE order_id START 100 INCREMENT 5;
DEFINE USER root ON ROOT PASSWORD "secret" ROLES OWNER;
DEFINE ACCESS account ON DATABASE TYPE JWT ALGORITHM HS512 KEY "secret";
DEFINE API "/hello" FOR get THEN RETURN "hello";
DEFINE CONFIG GRAPHQL AUTO;
DEFINE CONFIG API PERMISSIONS FULL MIDDLEWARE a::b(), c::d();
DEFINE CONFIG GRAPHQL TABLES INCLUDE users, posts FUNCTIONS AUTO;
DEFINE CONFIG DEFAULT NAMESPACE "a" DATABASE "b";
DEFINE BUCKET media BACKEND "memory" READONLY PERMISSIONS FULL;
DEFINE MODULE f"abc" AS mod::bla PERMISSIONS FULL;
DEFINE MODEL ml::classifier<1.0.0> COMMENT "classifier" PERMISSIONS FULL;
```

```ts
db.define.namespace("test");
db.define.database("test");
db.define.param("host").value("localhost").permissions("FULL");

db.define.function("shout")
  .args({ text: q.type.string() })
  .body((args) => q.return(fn.string.uppercase(args.text)));

db.define.event("on_create")
  .on("person")
  .when((ctx) => ctx.event.eq("CREATE"))
  .then(db.create("audit").set((a) => [a.record.assign(q.after.id)]));

db.define.analyzer("simple").tokenizers("blank", "class").filters("lowercase");
db.define.sequence("order_id").start(100).increment(5);
db.define.user("root").on("ROOT").password("secret").roles("OWNER");
db.define.access("account").on("DATABASE").jwt({ algorithm: "HS512", key: "secret" });
db.define.api("/hello").for("get").then(q.return("hello"));
db.define.config("GRAPHQL").auto();
db.define.config("API").permissions("FULL").middleware("a::b", "c::d");
db.define.config("GRAPHQL").tables.include("users", "posts").functions.auto();
db.define.config("DEFAULT").namespace("a").database("b");
db.define.bucket("media").backend("memory").readonly().permissions("FULL");
db.define.module(q.file("abc")).as("mod::bla").permissions("FULL");
db.define.model("classifier", "1.0.0").comment("classifier").permissions("FULL");
```

API implications:

- `DEFINE FUNCTION` and event bodies validate the "unawaited action is expression" model.
- Access, user, and API definitions need admin-resource builders separate from document CRUD.
- File buckets, modules, configs, and models are resource definitions too and should not require raw strings.
- Keep resource names typed but allow expressions where SurrealQL permits expressions.
