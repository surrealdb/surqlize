/**
 * Type-checks the TypeScript blocks of README.md against the library source.
 *
 * Each checked block is written to its own module under `.generated/`. The
 * module imports the prelude (`./prelude.ts`, the README's running example),
 * hoists the block's own `import` lines, and wraps the rest of the block in
 * `{ ... }`, so a block that declares a name the prelude also has shadows it
 * rather than colliding. `surqlize` resolves to `src/` through `paths`.
 *
 * Diagnostics come from the TypeScript API, per file. The CLI would stop
 * reporting semantic errors as soon as any file has a syntax error, so one bad
 * block could hide the others.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import type { ReadmeBlock } from "./extract";
import * as prelude from "./prelude";

export const REPO_ROOT = resolve(import.meta.dir, "../..");
export const GENERATED_DIR = resolve(import.meta.dir, ".generated");

export interface BlockResult {
	block: ReadmeBlock;
	/** Diagnostics for the block's module, formatted as `TSnnnn: message`. */
	errors: string[];
	/** Whether any of `errors` is a syntax error. */
	syntax: boolean;
	/** Whether any of `errors` is an undefined name (TS2304). */
	undefinedName: boolean;
}

const PRELUDE_NAMES = Object.keys(prelude).sort();

/** Wraps one block into a module. Hoists its `import` lines out of the braces. */
export function wrapBlock(block: ReadmeBlock): string {
	const hoisted: string[] = [];
	const body: string[] = [];
	for (const line of block.code.split("\n")) {
		if (/^import\s/.test(line)) {
			if (!line.trimEnd().endsWith(";")) {
				throw new Error(
					`README.md:${block.line}: multi-line import in a checked block; mark it illustrative`,
				);
			}
			hoisted.push(line);
		} else {
			body.push(line);
		}
	}
	return [
		`// README.md:${block.line}`,
		`import { ${PRELUDE_NAMES.join(", ")} } from "../prelude.ts";`,
		...hoisted,
		"{",
		...body,
		"}",
		"",
	].join("\n");
}

/** Type-checks every non-illustrative block and returns one result per block. */
export function checkBlocks(blocks: ReadmeBlock[]): BlockResult[] {
	const checked = blocks.filter((b) => b.mode !== "illustrative");
	rmSync(GENERATED_DIR, { recursive: true, force: true });
	mkdirSync(GENERATED_DIR, { recursive: true });
	for (const block of checked) {
		writeFileSync(join(GENERATED_DIR, fileName(block)), wrapBlock(block));
	}
	writeFileSync(
		join(GENERATED_DIR, "tsconfig.json"),
		`${JSON.stringify(
			{
				extends: "../../../tsconfig.json",
				compilerOptions: {
					// Snippets are examples, not lint-clean code: unused locals are fine.
					noUnusedLocals: false,
					noUnusedParameters: false,
					paths: { surqlize: ["../../../src/index.ts"] },
				},
				include: ["*.ts"],
				exclude: [],
			},
			null,
			"\t",
		)}\n`,
	);

	try {
		return diagnose(checked);
	} finally {
		rmSync(GENERATED_DIR, { recursive: true, force: true });
	}
}

function fileName(block: ReadmeBlock): string {
	return `block-${block.index}.ts`;
}

function diagnose(checked: ReadmeBlock[]): BlockResult[] {
	const configPath = join(GENERATED_DIR, "tsconfig.json");
	const parsed = ts.getParsedCommandLineOfConfigFile(
		configPath,
		{},
		{
			...ts.sys,
			onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
				throw new Error(
					ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
				);
			},
		},
	);
	if (!parsed) throw new Error(`cannot read ${configPath}`);

	const program = ts.createProgram({
		rootNames: parsed.fileNames,
		options: parsed.options,
	});
	const byFile = new Map<string, ts.Diagnostic[]>();
	for (const sf of program.getSourceFiles()) {
		const name = sf.fileName.split("/").pop() ?? "";
		if (!/^block-\d+\.ts$/.test(name)) continue;
		byFile.set(name, [
			...program.getSyntacticDiagnostics(sf),
			...program.getSemanticDiagnostics(sf),
		]);
	}

	return checked.map((block) => {
		const diagnostics = byFile.get(fileName(block)) ?? [];
		const errors = diagnostics.map(formatDiagnostic);
		return {
			block,
			errors,
			syntax: diagnostics.some((d) => d.file && isSyntax(d)),
			undefinedName: diagnostics.some((d) => d.code === 2304),
		};
	});
}

function isSyntax(diagnostic: ts.Diagnostic): boolean {
	// Syntax diagnostics carry codes in the 1000-1999 range (TS1005, TS1128, ...).
	return diagnostic.code >= 1000 && diagnostic.code < 2000;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
	const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
	const where =
		diagnostic.file && diagnostic.start !== undefined
			? `line ${diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1}: `
			: "";
	return `TS${diagnostic.code} ${where}${message}`;
}

export function readReadme(): string {
	return readFileSync(join(REPO_ROOT, "README.md"), "utf8");
}
