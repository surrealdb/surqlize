import { afterAll, beforeAll } from "bun:test";
import type { TestDb } from "../helpers/db";
import { setupTestDb } from "../helpers/db";

export function withTestDb(setup?: (testDb: TestDb) => Promise<void>) {
	let testDb: TestDb;

	beforeAll(async () => {
		testDb = await setupTestDb();
		if (setup) {
			await setup(testDb);
		}
	});

	afterAll(async () => {
		if (testDb?.cleanup) {
			await testDb.cleanup();
		}
	});

	return () => testDb;
}
