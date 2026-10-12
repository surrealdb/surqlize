/**
 * Extracts the TypeScript code blocks of README.md for the README harness.
 *
 * A block is a fenced block whose language is `typescript` (or `ts`). Its
 * optional modifier, written after the language on the fence line, says how the
 * harness treats it:
 *
 * - (none): the block must type-check against the library source.
 * - `illustrative`: opt-out. The block is a fragment (it uses `...`, names it
 *   never declares, shows alternatives that redeclare a name, or is multi-file)
 *   and is not compiled.
 * - `known-bug`: the block is expected to fail to type-check because of a
 *   tracked library bug. The harness fails once it compiles, so the marker is
 *   removed when the bug is fixed.
 *
 * Unknown modifiers throw, so a typo cannot silently turn a check off.
 */

export type BlockMode = "check" | "illustrative" | "known-bug";

export interface ReadmeBlock {
	/** 1-based position among the TypeScript blocks of the README. */
	index: number;
	/** 1-based line of the opening fence. */
	line: number;
	mode: BlockMode;
	code: string;
}

interface OpenFence {
	line: number;
	language: string;
	info: string;
	body: string[];
}

const MODIFIERS: Record<string, BlockMode> = {
	illustrative: "illustrative",
	"known-bug": "known-bug",
};

export function extractBlocks(markdown: string): ReadmeBlock[] {
	const lines = markdown.split("\n");
	const blocks: ReadmeBlock[] = [];
	let open: OpenFence | undefined;

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i] ?? "";
		if (!open) {
			open = startFence(raw.trimEnd(), i + 1);
		} else if (raw.trimEnd() === "```") {
			if (isTypeScript(open.language)) {
				blocks.push(toBlock(open, blocks.length + 1));
			}
			open = undefined;
		} else {
			open.body.push(raw);
		}
	}

	if (open) {
		throw new Error(`README.md:${open.line}: unterminated code block`);
	}
	return blocks;
}

/** The fence that opens at `text`, or undefined when `text` is not a fence. */
function startFence(text: string, line: number): OpenFence | undefined {
	const match = /^```(\S*)(.*)$/.exec(text);
	if (!match) return undefined;
	return { line, language: match[1] ?? "", info: match[2] ?? "", body: [] };
}

function toBlock(open: OpenFence, index: number): ReadmeBlock {
	return {
		index,
		line: open.line,
		mode: parseModifier(open.info, open.line),
		code: open.body.join("\n"),
	};
}

function isTypeScript(language: string): boolean {
	return language === "typescript" || language === "ts";
}

function parseModifier(info: string, line: number): BlockMode {
	const words = info.trim().split(/\s+/).filter(Boolean);
	if (words.length > 1) {
		throw new Error(
			`README.md:${line}: too many fence modifiers: "${info.trim()}"`,
		);
	}
	const [word] = words;
	if (word === undefined) return "check";
	const mode = MODIFIERS[word];
	if (mode === undefined) {
		throw new Error(`README.md:${line}: unknown fence modifier "${word}"`);
	}
	return mode;
}
