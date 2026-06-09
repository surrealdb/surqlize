# Statement: ACCESS

Source coverage: `statements/access/root`, `statements/access/ns`, `statements/access/db`.

```surql
ACCESS account ON DATABASE GRANT FOR USER user:one;
ACCESS account ON DATABASE SHOW;
ACCESS account ON DATABASE REVOKE FOR USER user:one;
ACCESS account ON DATABASE PURGE EXPIRED;
```

```ts
db.access("account").on("DATABASE").grant().forUser(q.rid("user", "one"));
db.access("account").on("DATABASE").show();
db.access("account").on("DATABASE").revoke().forUser(q.rid("user", "one"));
db.access("account").on("DATABASE").purge({ expired: true });
```

API implications:

- Runtime `ACCESS` statements are not the same as `DEFINE ACCESS`.
- The builder should model `GRANT`, `SHOW`, `REVOKE`, and `PURGE` as exclusive actions.

