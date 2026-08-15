/**
 * Terminal output.
 *
 * Colour is applied through a handful of escape codes rather than a dependency,
 * and suppressed when the output is not a terminal or `NO_COLOR` is set, so
 * piping to a file or a CI log stays readable.
 */

const enabled =
	process.stdout.isTTY === true &&
	!process.env.NO_COLOR &&
	process.env.TERM !== "dumb";

/** Wrap `text` in an SGR code, or leave it alone when colour is off. */
function paint(code: number, text: string): string {
	return enabled ? `[${code}m${text}[0m` : text;
}

export const style = {
	bold: (text: string) => paint(1, text),
	dim: (text: string) => paint(2, text),
	red: (text: string) => paint(31, text),
	green: (text: string) => paint(32, text),
	yellow: (text: string) => paint(33, text),
	blue: (text: string) => paint(34, text),
	cyan: (text: string) => paint(36, text),
};

export function info(message: string): void {
	console.log(message);
}

export function success(message: string): void {
	console.log(`${style.green("✔")} ${message}`);
}

export function warn(message: string): void {
	console.log(`${style.yellow("!")} ${message}`);
}

export function fail(message: string): void {
	console.error(`${style.red("✖")} ${message}`);
}

/** Print SurrealQL, dimming comments so the statements stand out. */
export function printStatements(statements: string[]): void {
	for (const statement of statements) {
		console.log(
			statement.startsWith("--") ? style.dim(statement) : style.cyan(statement),
		);
	}
}
