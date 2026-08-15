import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Surreal } from "surrealdb";
import { applied, migrate, plan, rollback } from "../migrator";
import type { DefinableSchema } from "../schema/ddl/define";
import { type DiagramLevel, mermaid } from "../schema/mermaid";
import { availableEnvironments, type CliConfig, loadConfig } from "./config";
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
  config      Show the settings in force, and the environments available
  mermaid     Draw an ER diagram of the schema

${style.bold("Options")}
  -u, --url <url>              SurrealDB address
  -n, --namespace <name>       Namespace
  -d, --database <name>        Database
  -U, --username <name>        Username
  -p, --password <pass>        Password
  -s, --schema <path>          Path to the schema module
  -e, --env <name>             Use a named environment from the config file
      --level <minimal|detailed>  How much detail a diagram carries
  -o, --output <path>          Where to write a diagram (default schema-diagram.mermaid)
      --stdout                 Print the diagram instead of writing it
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
	env: { type: "string", short: "e" },
	level: { type: "string" },
	output: { type: "string", short: "o" },
	stdout: { type: "boolean" },
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
		// Asking for help is a successful invocation; being given nothing is not.
		return flags.help ? 0 : 1;
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

	const environment = flags.env as string | undefined;

	const options = {
		removeMissing: flags["remove-missing"] === true,
		assumeYes: flags.yes === true,
	};

	switch (command) {
		case "init":
			return initCommand();
		case "config":
			return configCommand(
				await loadConfig(overrides, process.cwd(), environment),
				environment,
			);
		case "validate":
			return validateCommand(
				await loadConfig(overrides, process.cwd(), environment),
			);
		case "mermaid":
			return mermaidCommand(
				await loadConfig(overrides, process.cwd(), environment),
				{
					level: flags.level as string | undefined,
					output: flags.output as string | undefined,
					stdout: flags.stdout === true,
				},
			);
		case "plan":
		case "diff":
			return planCommand(
				await loadConfig(overrides, process.cwd(), environment),
				options,
			);
		case "migrate":
			return migrateCommand(
				await loadConfig(overrides, process.cwd(), environment),
				options,
			);
		case "status":
			return statusCommand(
				await loadConfig(overrides, process.cwd(), environment),
			);
		case "rollback":
			return rollbackCommand(
				await loadConfig(overrides, process.cwd(), environment),
				options,
			);
		default:
			fail(`Unknown command: ${command}`);
			info(USAGE);
			return 1;
	}
}

/** How long to wait for a connection before giving up. */
const CONNECT_TIMEOUT_MS = 10_000;

/** Reject with `message` if `work` has not settled within `ms`. */
async function withTimeout<T>(
	work: Promise<T>,
	ms: number,
	message: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;

	try {
		return await Promise.race([
			work,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(message)), ms);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

/** The name of each definition, for reporting what a schema declares. */
function names(definitions: Definition[]): string[] {
	return definitions.map((definition) =>
		"tb" in definition ? definition.tb : definition.name,
	);
}

/** Whether a definition is a table or edge, which is all a diagram draws. */
function isDefinable(definition: Definition): definition is DefinableSchema {
	return "tb" in definition;
}

/** Connect a session, pointed at the configured namespace and database. */
async function connect(config: CliConfig): Promise<Surreal> {
	const surreal = new Surreal();

	try {
		// The driver retries a WebSocket connection indefinitely, which is right
		// for a long-running app and wrong for a command: a mistyped URL would
		// hang with nothing on screen. One attempt, with a deadline, then say so.
		await withTimeout(
			surreal.connect(config.url, { reconnect: false }),
			CONNECT_TIMEOUT_MS,
			`Could not reach ${config.url} within ${CONNECT_TIMEOUT_MS / 1000}s.`,
		);
		await surreal.signin({
			username: config.username,
			password: config.password,
		});
		await surreal.use({
			namespace: config.namespace,
			database: config.database,
		});
	} catch (error) {
		// A half-open socket keeps the process alive, so a failure that is
		// reported but not closed would hang instead of exiting.
		await surreal.close().catch(() => {});
		throw error;
	}

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
	info(`  Tables and edges: ${names(tables).join(", ") || "none"}`);
	if (entities.length)
		info(`  Other definitions: ${names(entities).join(", ")}`);

	return 0;
}

/**
 * Report the settings in force and the environments available.
 *
 * Chiefly a way to check that `--env production` resolves to what you think it
 * does before running anything against it.
 */
async function configCommand(
	config: CliConfig,
	environment: string | undefined,
): Promise<number> {
	if (environment) success(`Environment: ${environment}`);

	for (const [key, value] of Object.entries(config)) {
		// Never print a password, even one that came from a checked-in file.
		info(`  ${key.padEnd(10)} ${key === "password" ? "********" : value}`);
	}

	const environments = await availableEnvironments();
	info(
		environments.length
			? `\n  Environments: ${environments.join(", ")}`
			: "\n  No environments defined",
	);

	return 0;
}

async function mermaidCommand(
	config: CliConfig,
	options: { level?: string; output?: string; stdout: boolean },
): Promise<number> {
	if (
		options.level &&
		options.level !== "minimal" &&
		options.level !== "detailed"
	) {
		fail(`--level must be "minimal" or "detailed", not "${options.level}"`);
		return 1;
	}

	const definitions = await loadDefinitions(config.schema);
	const tables = definitions.filter(isDefinable);

	const diagram = mermaid(tables, {
		level: (options.level as DiagramLevel | undefined) ?? "minimal",
	});

	if (options.stdout) {
		process.stdout.write(`${diagram}\n`);
		return 0;
	}

	const path = options.output ?? "schema-diagram.mermaid";
	await writeFile(path, `${diagram}\n`, "utf-8");

	success(`Wrote ${path}`);
	info(
		style.dim(
			"Paste it into any Mermaid viewer, or a Markdown ```mermaid block",
		),
	);
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

// Both templates open with a comment on purpose. `.ts` is claimed by both
// TypeScript and Qt Linguist, and shared-mime-info only recognises TypeScript by
// magic at offset 0 — `/*`, `//`, `class` or `function`. Without one of those the
// glob decides, and TypeScript's carries weight 40 against Linguist's 50, so a
// file leading with `import` gets a Linguist icon in a file manager.
const SCHEMA_TEMPLATE = `/**
 * Your database schema.
 *
 * Every table and edge exported here is one Surqlize will manage. Run
 * \`sur plan\` to see what it would change, then \`sur migrate\` to apply it.
 */
import { t, table } from "surqlize";

export const user = table("user", {
  name: t.string().assert("string::len($value) > 0"),
  email: t.string().assert("string::is_email($value)"),
  createdAt: t.date().default("time::now()").readonly(),
})
  .index("email_idx", { fields: ["email"], unique: true });
`;

const CONFIG_TEMPLATE = `/**
 * Where Surqlize connects, and which file describes the schema.
 *
 * Add an \`environments\` block to describe more than one deployment, then
 * select one with \`--env <name>\`.
 */
export default {
  schema: "./schema.ts",

  url: "ws://localhost:8000",
  namespace: "test",
  database: "test",
  username: "root",
  password: "root",
};
`;
