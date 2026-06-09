# Functions: crypto

Coverage list: hashes `blake3`, `joaat`, `md5`, `sha1`, `sha256`, `sha512`; password functions `argon2::compare`, `argon2::generate`, `bcrypt::compare`, `bcrypt::generate`, `pbkdf2::compare`, `pbkdf2::generate`, `scrypt::compare`, `scrypt::generate`.

```surql
RETURN crypto::sha256("hello");
RETURN crypto::blake3("hello");
RETURN crypto::argon2::generate("secret");
RETURN crypto::argon2::compare("secret", "$argon2id$...");
RETURN crypto::bcrypt::generate("secret");
RETURN crypto::scrypt::compare("secret", "$scrypt$...");
```

```ts
fn.crypto.sha256("hello");
fn.crypto.blake3("hello");
fn.crypto.argon2.generate("secret");
fn.crypto.argon2.compare("secret", q.param("hash"));
fn.crypto.bcrypt.generate("secret");
fn.crypto.scrypt.compare("secret", q.param("hash"));
```

Type-safety target:

- Hash functions return strings.
- Password compare functions return booleans and password generate functions return strings.
- Expensive async server functions still remain embeddable expressions before await.

