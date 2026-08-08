// Entry point for `surqlize/migrate`.
//
// Kept apart from the root entry so importing the ORM in a browser bundle does
// not pull in migration machinery it will never use.

export * from "./migrator";
