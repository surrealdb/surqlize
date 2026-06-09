import * as ts from "typescript";

/**
 * A tiny harness for asserting the editor autocomplete that the library's typed
 * builders offer. It drives the real TypeScript language service — the same API
 * VS Code and other editors use — so these tests guard *suggestions*.
 *
 * This matters because `tsc` and `@ts-expect-error` cannot: an over-constrained
 * signature can type-check perfectly and still offer zero completions (e.g.
 * validating args via an intersection on the parameter type, rather than
 * constraining the type parameter directly — see `GraphArgs` in
 * `src/schema/traversal.ts`).
 *
 * Each test file injects its own schema via `warmCompletions(schema)` in a
 * `beforeAll`, so suites are self-contained and can use whatever tables/edges
 * they need. The schema is a source preamble — imports plus table/edge/orm
 * setup — and is prepended to every snippet. Because the fixture is rooted at
 * the repo root, preambles import the library via `./src` (and `surrealdb`).
 *
 * ```ts
 * const SCHEMA = `
 *   import { RecordId, Surreal } from "surrealdb";
 *   import { edge, orm, t, table } from "./src";
 *   const user = table("user", { name: t.string() });
 *   const post = table("post", { title: t.string() });
 *   const authored = edge("user", "authored", "post", {});
 *   const db = orm(new Surreal(), user, post, authored);
 *   void [db, RecordId];
 * `;
 *
 * beforeAll(() => warmCompletions(SCHEMA));
 *
 * test("…", () => {
 *   expectCompletions(`db.value(new RecordId("user", "x")).out("|")`)
 *     .toSuggest("authored")
 *     .notToSuggest("tagged");
 * });
 * ```
 *
 * Put the caret marker `|` where the cursor would be — usually inside an empty
 * string argument: `.out("|")`. Snippets are expressions (wrapped in `void (…)`)
 * unless `raw: true` is passed.
 */

const DEFAULT_MARKER = "|";

/** Schema preamble for the current test file, set by `warmCompletions`. */
let currentSchema: string | null = null;

let cached: { query: (source: string, position: number) => string[] } | null =
	null;

function service() {
	if (cached) return cached;

	const cwd = ts.sys.getCurrentDirectory();
	const configPath = ts.findConfigFile(cwd, ts.sys.fileExists);
	if (!configPath)
		throw new Error("completions harness: tsconfig.json not found");
	// `findConfigFile` returns a normalized, forward-slash absolute path.
	const rootDir = configPath.slice(0, configPath.lastIndexOf("/"));
	const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
	const { options } = ts.parseJsonConfigFileContent(config, ts.sys, rootDir);

	// A virtual fixture at the repo root (never written to disk, so it never
	// reaches `tsc`); rooting it here lets preambles import the library as
	// `./src` and `surrealdb` from `node_modules`.
	const fixturePath = `${rootDir}/__completion_fixture__.ts`;

	let text = "";
	let version = 0;

	const host: ts.LanguageServiceHost = {
		getScriptFileNames: () => [fixturePath],
		getScriptVersion: (f) => (f === fixturePath ? String(version) : "0"),
		getScriptSnapshot: (f) => {
			const content = f === fixturePath ? text : ts.sys.readFile(f);
			return content === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(content);
		},
		getCurrentDirectory: () => rootDir,
		getCompilationSettings: () => options,
		getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
		fileExists: (f) => f === fixturePath || ts.sys.fileExists(f),
		readFile: (f) => (f === fixturePath ? text : ts.sys.readFile(f)),
		readDirectory: ts.sys.readDirectory,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
	};

	const ls = ts.createLanguageService(host, ts.createDocumentRegistry());

	cached = {
		query(source, position) {
			text = source;
			version++;
			const info = ls.getCompletionsAtPosition(
				fixturePath,
				position,
				undefined,
			);
			return info ? info.entries.map((e) => e.name) : [];
		},
	};
	return cached;
}

export interface CompletionOptions {
	/** Schema preamble for this snippet. Defaults to the file's injected schema. */
	preamble?: string;
	/** Caret token to locate (removed before querying). Defaults to `|`. */
	marker?: string;
	/** Insert the snippet verbatim instead of wrapping it in `void (…)`. */
	raw?: boolean;
}

function resolveSchema(opts?: CompletionOptions): string {
	const schema = opts?.preamble ?? currentSchema;
	if (schema == null) {
		throw new Error(
			"completions harness: no schema configured — call warmCompletions(schema) in a beforeAll(), or pass { preamble } per call.",
		);
	}
	return schema;
}

function build(code: string, opts?: CompletionOptions) {
	const marker = opts?.marker ?? DEFAULT_MARKER;
	const schema = resolveSchema(opts);
	const withMarker = opts?.raw
		? `${schema}\n${code}\n`
		: `${schema}\nvoid (${code});\n`;

	const at = withMarker.indexOf(marker);
	if (at === -1) {
		throw new Error(
			`completions harness: marker ${JSON.stringify(marker)} not found in snippet`,
		);
	}
	if (withMarker.indexOf(marker, at + marker.length) !== -1) {
		throw new Error(
			`completions harness: more than one marker ${JSON.stringify(marker)} in snippet`,
		);
	}
	return {
		source: withMarker.slice(0, at) + withMarker.slice(at + marker.length),
		position: at,
	};
}

/**
 * Inject the schema for this test file and build the program once. Call from a
 * `beforeAll`. The `schema` is a source preamble (imports + table/edge/orm
 * setup) prepended to every snippet; import the library via `./src`.
 */
export function warmCompletions(schema: string): void {
	currentSchema = schema;
	service().query(schema, schema.length);
}

/** The raw completion entry names offered at the marker. */
export function completionsAt(
	code: string,
	opts?: CompletionOptions,
): string[] {
	const { source, position } = build(code, opts);
	return service().query(source, position);
}

export interface CompletionAssertions {
	readonly names: string[];
	/** Every given name must be offered. */
	toSuggest(...expected: string[]): CompletionAssertions;
	/** None of the given names may be offered. */
	notToSuggest(...unexpected: string[]): CompletionAssertions;
	/** The offered names must equal exactly the given set (order-insensitive). */
	toSuggestExactly(...expected: string[]): CompletionAssertions;
}

/** Fluent assertions over the completions offered at the marker. */
export function expectCompletions(
	code: string,
	opts?: CompletionOptions,
): CompletionAssertions {
	const names = completionsAt(code, opts);
	const set = new Set(names);
	const show = () => (names.length ? names.join(", ") : "<none>");
	const api: CompletionAssertions = {
		names,
		toSuggest(...expected) {
			for (const name of expected) {
				if (!set.has(name)) {
					throw new Error(
						`expected completion "${name}", but offered: ${show()}`,
					);
				}
			}
			return api;
		},
		notToSuggest(...unexpected) {
			for (const name of unexpected) {
				if (set.has(name)) {
					throw new Error(
						`did not expect completion "${name}", but offered: ${show()}`,
					);
				}
			}
			return api;
		},
		toSuggestExactly(...expected) {
			const got = [...set].sort();
			const want = [...new Set(expected)].sort();
			const equal =
				got.length === want.length && got.every((g, i) => g === want[i]);
			if (!equal) {
				throw new Error(
					`expected exactly [${want.join(", ")}], but offered: [${got.join(", ")}]`,
				);
			}
			return api;
		},
	};
	return api;
}
