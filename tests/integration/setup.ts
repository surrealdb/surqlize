import { afterAll, afterEach, beforeAll, beforeEach } from "bun:test";
import type { TestDb } from "../helpers/db";
import { setupTestDb } from "../helpers/db";

export interface WithTestDbOptions {
	/** If true, create a new database for each test. If false (default), share database across all tests in the suite. */
	perTest?: boolean;
	/** Setup function to run after database creation */
	setup?: (testDb: TestDb) => Promise<void>;
}

export function withTestDb(
	optionsOrSetup?: WithTestDbOptions | ((testDb: TestDb) => Promise<void>),
) {
	// Support both old API (just setup function) and new API (options object)
	const options: WithTestDbOptions =
		typeof optionsOrSetup === "function"
			? { setup: optionsOrSetup, perTest: false }
			: { perTest: false, ...optionsOrSetup };

	let testDb: TestDb;

	if (options.perTest) {
		// Create a new database for each test
		beforeEach(async () => {
			testDb = await setupTestDb();
			if (options.setup) {
				await options.setup(testDb);
			}
		});

		afterEach(async () => {
			if (testDb?.cleanup) {
				await testDb.cleanup();
			}
		});
	} else {
		// Share database across all tests in the suite
		beforeAll(async () => {
			testDb = await setupTestDb();
			if (options.setup) {
				await options.setup(testDb);
			}
		});

		afterAll(async () => {
			if (testDb?.cleanup) {
				await testDb.cleanup();
			}
		});
	}

	return () => testDb;
}
