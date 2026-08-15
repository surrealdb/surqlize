#!/usr/bin/env node
// The `sur` command.

import { run } from "./cli/index";

// Not top-level await: the CJS build cannot express it, and the CLI is built in
// both formats alongside the rest of the package.
run()
	.then((code) => {
		process.exitCode = code;
	})
	.catch((error: unknown) => {
		// run() handles its own errors, so reaching here means a bug rather than
		// a bad command. Say so plainly instead of failing silently.
		console.error(error instanceof Error ? error.stack : String(error));
		process.exitCode = 1;
	});
