import type { SurrealSession } from "surrealdb";
import type { DefinableSchema } from "../schema/ddl/define";
import { type Diff, type DiffOptions, diff } from "./diff";
import { introspect, MIGRATIONS_TABLE } from "./introspect";

/** A migration that has been applied, as recorded in the database. */
export interface AppliedMigration {
	/** When it ran, and what makes it unique. */
	id: string;
	appliedAt: string;
	/** The statements that were run. */
	up: string[];
	/** The statements that undo them. */
	down: string[];
	/** A digest of `up`, so a tampered history can be detected. */
	checksum: string;
}

/** What `plan()` worked out needs doing. */
export interface MigrationPlan extends Diff {
	/** Whether there is anything to apply. */
	hasChanges: boolean;
}

/**
 * Work out what a schema would change, without changing anything.
 *
 * @param surreal - A session pointed at the target namespace and database
 * @param schemas - The tables and edges the schema declares
 * @param options - How to treat undeclared tables and fields
 */
export async function plan(
	surreal: SurrealSession,
	schemas: DefinableSchema[],
	options: DiffOptions = {},
): Promise<MigrationPlan> {
	const current = await introspect(surreal);
	const result = diff(schemas, current, options);

	return { ...result, hasChanges: result.up.length > 0 };
}

/**
 * Bring the database in line with the schema, recording what was done.
 *
 * Statements run in one query so SurrealDB applies them together — a failure
 * part-way leaves the earlier statements applied, which is why `plan()` exists
 * and why the CLI shows the plan before running it.
 *
 * @param surreal - A session pointed at the target namespace and database
 * @param schemas - The tables and edges the schema declares
 * @param options - How to treat undeclared tables and fields
 * @returns The migration that was recorded, or null when nothing needed doing
 */
export async function migrate(
	surreal: SurrealSession,
	schemas: DefinableSchema[],
	options: DiffOptions = {},
): Promise<AppliedMigration | null> {
	const pending = await plan(surreal, schemas, options);
	if (!pending.hasChanges) return null;

	await ensureMigrationsTable(surreal);
	await surreal.query(pending.up.join("\n"));

	return record(surreal, pending);
}

/**
 * Undo the most recent migration.
 *
 * @param surreal - A session pointed at the target namespace and database
 * @returns The migration that was undone, or null when there is no history
 */
export async function rollback(
	surreal: SurrealSession,
): Promise<AppliedMigration | null> {
	const history = await applied(surreal);
	const last = history.at(-1);
	if (!last) return null;

	verifyChecksum(last);

	if (last.down.length) await surreal.query(last.down.join("\n"));
	await surreal.query(`DELETE ${MIGRATIONS_TABLE} WHERE id = $id;`, {
		id: last.id,
	});

	return last;
}

/**
 * Every migration that has been applied, oldest first.
 *
 * @param surreal - A session pointed at the target namespace and database
 */
export async function applied(
	surreal: SurrealSession,
): Promise<AppliedMigration[]> {
	await ensureMigrationsTable(surreal);

	const [rows] = await surreal.query<[AppliedMigration[]]>(
		`SELECT * FROM ${MIGRATIONS_TABLE} ORDER BY appliedAt ASC;`,
	);

	return rows ?? [];
}

/**
 * A digest of the statements a migration applied.
 *
 * Recorded so a rollback can tell that the history it is about to reverse is
 * the history that was written — an edited `up` means the `down` no longer
 * undoes it.
 */
export function checksum(statements: string[]): string {
	const input = statements.join("\n");
	// FNV-1a: enough to catch an edited record, and needs no crypto import, which
	// would make this module unusable in a browser.
	let hash = 0x811c9dc5;

	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}

	return hash.toString(16).padStart(8, "0");
}

/** Create the migrations table if it is not there yet. */
async function ensureMigrationsTable(surreal: SurrealSession): Promise<void> {
	await surreal.query(
		`DEFINE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} SCHEMALESS;`,
	);
}

/** Write a migration into the history. */
async function record(
	surreal: SurrealSession,
	pending: MigrationPlan,
): Promise<AppliedMigration> {
	const migration: Omit<AppliedMigration, "id"> = {
		appliedAt: new Date().toISOString(),
		up: pending.up,
		down: pending.down,
		checksum: checksum(pending.up),
	};

	const [created] = await surreal.query<[AppliedMigration[]]>(
		`CREATE ${MIGRATIONS_TABLE} CONTENT $migration;`,
		{ migration },
	);

	return created?.[0] as AppliedMigration;
}

/** Throw if a recorded migration no longer matches its checksum. */
function verifyChecksum(migration: AppliedMigration): void {
	const actual = checksum(migration.up);
	if (actual === migration.checksum) return;

	throw new Error(
		`Migration ${migration.id} has been modified since it was applied ` +
			`(expected checksum ${migration.checksum}, got ${actual}). ` +
			"Rolling it back would not undo what actually ran.",
	);
}
