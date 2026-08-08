import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Surreal } from "surrealdb";
import { applied, migrate, plan, rollback } from "../migrator";
import { type CliConfig, loadConfig } from "./config";
import { fail, info, printStatements, style, success, warn } from "./output";
import { type Definition, loadDefinitions } from "./schema";

const USAGE = `
${style.bold("sur")} — schema migrations for SurrealDB

${style.bold("Usage")}
  sur <command> [options]

${style.bold("Commands")}
  init        Create a schema file and a config file
  plan        Show what would change, without changing it
  migrate     Apply the schema to the database
  status      List the migrations that have been applied
  rollback    Undo the most recent migration
  validate    Load the schema and report what it declares, without connecting

${style.bold("Options")}
  -u, --url <url>              SurrealDB address
  -n, --namespace <name>       Namespace
  -d, --database <name>        Database
  -U, --username <name>        Username
  -p, --password <pass>        Password
  -s, --schema <path>          Path to the schema module
      --remove-missing         Drop tables and fields the schema no longer declares
      --yes                    Do not ask for confirmation
  -h, --help                   Show this message

Settings are read from surqlize.config.ts, then SURREAL_* environment
variables, then these flags.
`.trim();

const OPTIONS = {
	url: { type: "string", short: "u" },
	namespace: { type: "string", short: "n" },
	database: { type: "string", short: "d" },
	username: { type: "string", short: "U" },
	password: { type: "string", short: "p" },
	schema: { type: "string", short: "s" },
	"remove-missing": { type: "boolean" },
	yes: { type: "boolean" },
	help: { type: "boolean", short: "h" },
} as const;

/**
 * Run the CLI.
 *
 * @param argv - Arguments after the executable and script name
 * @returns The process exit code
 */
export async function run(
	argv: string[] = process.argv.slice(2),
): Promise<number> {
	let parsed: {
		values: Record<string, string | boolean | undefined>;
		positionals: string[];
	};

	try {
		parsed = parseArgs({
			args: argv,
			options: OPTIONS,
			allowPositionals: true,
		});
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
		return 1;
	}

	const command = parsed.positionals[0];
	const flags = parsed.values;

	if (flags.help || !command) {
		info(USAGE);
		return command ? 0 : 1;
	}

	try {
		return await dispatch(command, flags);
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
		return 1;
	}
}

/** Route a command to its handler. */
async function dispatch(
	command: string,
	flags: Record<string, string | boolean | undefined>,
): Promise<number> {
	const overrides = {
		url: flags.url as string | undefined,
		namespace: flags.namespace as string | undefined,
		database: flags.database as string | undefined,
		username: flags.username as string | undefined,
		password: flags.password as string | undefined,
		schema: flags.schema as string | undefined,
	};

	const options = {
		removeMissing: flags["remove-missing"] === true,
		assumeYes: flags.yes === true,
	};

	switch (command) {
		case "init":
			return initCommand();
		case "validate":
			return validateCommand(await loadConfig(overrides));
		case "plan":
		case "diff":
			return planCommand(await loadConfig(overrides), options);
		case "migrate":
			return migrateCommand(await loadConfig(overrides), options);
		case "status":
			return statusCommand(await loadConfig(overrides));
		case "rollback":
			return rollbackCommand(await loadConfig(overrides), options);
		default:
			fail(`Unknown command: ${command}`);
			info(USAGE);
			return 1;
	}
}

/** Connect a session, pointed at the configured namespace and database. */
async function connect(config: CliConfig): Promise<Surreal> {
	const surreal = new Surreal();

	await surreal.connect(config.url);
	await surreal.signin({
		username: config.username,
		password: config.password,
	});
	await surreal.use({
		namespace: config.namespace,
		database: config.database,
	});

	return surreal;
}

/** Load the schema and connect, running `body` with both. */
async function withSchema<T>(
	config: CliConfig,
	body: (surreal: Surreal, definitions: Definition[]) => Promise<T>,
): Promise<T> {
	const definitions = await loadDefinitions(config.schema);
	const surreal = await connect(config);

	try {
		return await body(surreal, definitions);
	} finally {
		await surreal.close();
	}
}

async function initCommand(): Promise<number> {
	const files: [string, string][] = [
		["schema.ts", SCHEMA_TEMPLATE],
		["surqlize.config.ts", CONFIG_TEMPLATE],
	];

	for (const [name, contents] of files) {
		if (existsSync(name)) {
			warn(`${name} already exists — leaving it alone`);
			continue;
		}
		await writeFile(name, contents, "utf-8");
		success(`Created ${name}`);
	}

	info("");
	info(
		`Next: edit ${style.bold("schema.ts")}, then run ${style.bold("sur plan")}`,
	);
	return 0;
}

async function validateCommand(config: CliConfig): Promise<number> {
	const definitions = await loadDefinitions(config.schema);

	const tables = definitions.filter((d) => "tb" in d);
	const entities = definitions.filter((d) => "kind" in d);

	success(`${config.schema} is valid`);
	info(`  Tables and edges: ${tables.length}`);
	if (entities.length) info(`  Other definitions: ${entities.length}`);

	return 0;
}

async function planCommand(
	config: CliConfig,
	options: { removeMissing: boolean },
): Promise<number> {
	return withSchema(config, async (surreal, definitions) => {
		const pending = await plan(surreal, definitions, options);

		if (!pending.hasChanges) {
			success("The database matches the schema — nothing to do");
			return 0;
		}

		info(style.bold(`${pending.changes.length} change(s):`));
		for (const change of pending.changes) {
			info(`  ${style.dim(change.kind)} ${change.target}`);
		}

		info("");
		info(style.bold("Statements:"));
		printStatements(pending.up);

		return 0;
	});
}

async function migrateCommand(
	config: CliConfig,
	options: { removeMissing: boolean; assumeYes: boolean },
): Promise<number> {
	return withSchema(config, async (surreal, definitions) => {
		const pending = await plan(surreal, definitions, options);

		if (!pending.hasChanges) {
			success("The database matches the schema — nothing to do");
			return 0;
		}

		info(style.bold("Statements to apply:"));
		printStatements(pending.up);
		info("");

		// Dropping things is the only destructive path, so it is the only one
		// that stops to ask.
		if (options.removeMissing && !options.assumeYes) {
			const destructive = pending.changes.filter((c) =>
				c.kind.endsWith("remove"),
			);

			if (destructive.length && !(await confirm(destructive.length))) {
				warn("Cancelled");
				return 1;
			}
		}

		const result = await migrate(surreal, definitions, options);
		success(`Applied ${result?.up.length ?? 0} statement(s)`);
		return 0;
	});
}

async function statusCommand(config: CliConfig): Promise<number> {
	const surreal = await connect(config);

	try {
		const history = await applied(surreal);

		if (!history.length) {
			info("No migrations have been applied");
			return 0;
		}

		info(style.bold(`${history.length} migration(s):`));
		for (const migration of history) {
			info(
				`  ${style.dim(migration.appliedAt)}  ${migration.up.length} statement(s)  ${style.dim(migration.checksum)}`,
			);
		}

		return 0;
	} finally {
		await surreal.close();
	}
}

async function rollbackCommand(
	config: CliConfig,
	options: { assumeYes: boolean },
): Promise<number> {
	const surreal = await connect(config);

	try {
		const history = await applied(surreal);
		const last = history.at(-1);

		if (!last) {
			warn("No migrations to roll back");
			return 0;
		}

		info(style.bold("Statements to apply:"));
		printStatements(last.down);
		info("");

		if (!options.assumeYes && !(await confirm(last.down.length))) {
			warn("Cancelled");
			return 1;
		}

		await rollback(surreal);
		success("Rolled back");
		return 0;
	} finally {
		await surreal.close();
	}
}

/** Ask before doing something that removes data. */
async function confirm(count: number): Promise<boolean> {
	if (!process.stdin.isTTY) {
		fail("Refusing to continue without a terminal to confirm on. Pass --yes.");
		return false;
	}

	process.stdout.write(
		`${style.yellow("!")} ${count} statement(s) will remove things. Continue? [y/N] `,
	);

	const answer = await new Promise<string>((resolve) => {
		process.stdin.once("data", (data) => resolve(data.toString().trim()));
	});

	return /^y(es)?$/i.test(answer);
}

const SCHEMA_TEMPLATE = `import { t, table } from "surqlize";

export const user = table("user", {
  name: t.string().assert("string::len($value) > 0"),
  email: t.string().assert("string::is_email($value)"),
  createdAt: t.date().default("time::now()").readonly(),
})
  .index("email_idx", { fields: ["email"], unique: true });
`;

const CONFIG_TEMPLATE = `export default {
  schema: "./schema.ts",

  url: "ws://localhost:8000",
  namespace: "test",
  database: "test",
  username: "root",
  password: "root",
};
`;
