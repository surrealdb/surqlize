import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Where to connect and which schema file describes it. */
export interface CliConfig {
	/** Path to the module exporting the schema definitions. */
	schema: string;
	url: string;
	namespace: string;
	database: string;
	username: string;
	password: string;
}

/**
 * The shape of a `surqlize.config.ts` file.
 *
 * Every connection setting may be overridden per named environment, so one
 * checked-in file can describe local, staging and production without repeating
 * the settings they share.
 *
 * ```ts
 * export default {
 *   schema: "./schema.ts",
 *   url: "ws://localhost:8000",
 *   environments: {
 *     staging: { url: "wss://staging.example.com", database: "app" },
 *     production: { url: "wss://example.com", database: "app" },
 *   },
 * };
 * ```
 */
export interface ConfigFile extends Partial<CliConfig> {
	environments?: Record<string, Partial<CliConfig>>;
}

/** Raised when `--env` names an environment the config file does not define. */
export class UnknownEnvironmentError extends Error {
	constructor(
		readonly requested: string,
		readonly available: string[],
	) {
		const list = available.length ? available.join(", ") : "none defined";
		super(`No environment named '${requested}'. Available: ${list}`);
		this.name = "UnknownEnvironmentError";
	}
}

/** Config filenames tried in order. */
const CONFIG_FILES = [
	"surqlize.config.ts",
	"surqlize.config.mts",
	"surqlize.config.js",
	"surqlize.config.mjs",
];

const DEFAULTS = {
	schema: "./schema.ts",
	url: "ws://localhost:8000",
	namespace: "test",
	database: "test",
	username: "root",
	password: "root",
} satisfies CliConfig;

/**
 * Build the effective configuration.
 *
 * Later sources win: defaults, then the config file, then the named
 * environment within it, then `SURREAL_*` environment variables, then
 * command-line flags. The `SURREAL_*` variables come after the file so a
 * deployment can override a checked-in config without editing it, and flags
 * come last so a one-off run can override everything.
 *
 * @param overrides - Values parsed from the command line
 * @param cwd - Directory to look for a config file in
 * @param environment - Name from `--env`, selecting a block within the file
 * @throws {UnknownEnvironmentError} If `environment` is not defined in the file
 */
export async function loadConfig(
	overrides: Partial<CliConfig> = {},
	cwd = process.cwd(),
	environment?: string,
): Promise<CliConfig> {
	const file = await loadConfigFile(cwd);
	const { environments, ...base } = file;

	if (environment && !environments?.[environment]) {
		throw new UnknownEnvironmentError(
			environment,
			Object.keys(environments ?? {}),
		);
	}

	return {
		...DEFAULTS,
		...definedOnly(base),
		...definedOnly(environment ? (environments?.[environment] ?? {}) : {}),
		...fromEnvironment(),
		...definedOnly(overrides),
	};
}

/**
 * The environments a config file defines, for reporting them.
 *
 * @param cwd - Directory to look for a config file in
 */
export async function availableEnvironments(
	cwd = process.cwd(),
): Promise<string[]> {
	return Object.keys((await loadConfigFile(cwd)).environments ?? {});
}

/** Read the first config file that exists, or nothing. */
async function loadConfigFile(cwd: string): Promise<ConfigFile> {
	for (const filename of CONFIG_FILES) {
		const path = resolve(cwd, filename);
		if (!existsSync(path)) continue;

		const module = await importModule(path);
		return (module.default ?? module) as ConfigFile;
	}

	return {};
}

/** Connection settings from the environment. */
function fromEnvironment(): Partial<CliConfig> {
	return definedOnly({
		schema: process.env.SURREAL_SCHEMA,
		url: process.env.SURREAL_URL,
		namespace: process.env.SURREAL_NAMESPACE,
		database: process.env.SURREAL_DATABASE,
		username: process.env.SURREAL_USERNAME,
		password: process.env.SURREAL_PASSWORD,
	});
}

/** Drop keys whose value is undefined, so they do not overwrite a real one. */
function definedOnly<T extends object>(source: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(source).filter(([, value]) => value !== undefined),
	) as Partial<T>;
}

/**
 * Import a module by path.
 *
 * TypeScript files are imported directly. Bun handles them natively, as does
 * Node from v22.6 with type stripping enabled; older runtimes need the schema
 * compiled to JavaScript first. Keeping this to a plain dynamic import is what
 * lets the package stay dependency-free.
 */
export async function importModule(
	path: string,
): Promise<Record<string, unknown>> {
	// A cache-busting query means a long-running process sees edits to the file.
	const url = `${pathToFileURL(path).href}?t=${Date.now()}`;

	try {
		return (await import(url)) as Record<string, unknown>;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		if (
			path.endsWith(".ts") &&
			/Unknown file extension|Cannot find module/.test(message)
		) {
			throw new Error(
				`Could not import ${path}.\n` +
					"Importing TypeScript directly needs Bun, or Node 22.6+ with " +
					"--experimental-strip-types. Alternatively point at a compiled .js file.",
			);
		}

		throw new Error(`Could not import ${path}: ${message}`);
	}
}
