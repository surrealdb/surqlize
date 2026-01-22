import Surreal from "surrealdb";
import { edge, orm, t, table } from "../../src";

export interface TestDb {
	db: ReturnType<typeof createTestOrm>;
	surreal: Surreal;
	cleanup: () => Promise<void>;
}

export function createTestOrm() {
	const user = table("user", {
		name: t.object({
			first: t.string(),
			last: t.string(),
		}),
		age: t.number(),
		email: t.string(),
		created: t.date(),
		updated: t.date(),
	});

	const post = table("post", {
		title: t.string(),
		body: t.string(),
		author: t.record("user"),
		created: t.date(),
		updated: t.date(),
	});

	const authored = edge("user", "authored", "post", {
		created: t.date(),
		updated: t.date(),
	});

	return orm(new Surreal(), user, post, authored);
}

export async function setupTestDb(): Promise<TestDb> {
	const surreal = new Surreal();
	const url = process.env.SURREAL_URL || "http://localhost:8000";

	// Generate a unique namespace and database for this test run
	const namespace = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
	const database = "test";

	await surreal.connect(url);
	await surreal.use({ namespace, database });

	const db = createTestOrm();

	const cleanup = async () => {
		try {
			// Delete the namespace to clean up all data
			await surreal.query(`REMOVE NAMESPACE ${namespace}`);
			await surreal.close();
		} catch (error) {
			console.error("Cleanup error:", error);
		}
	};

	return { db, surreal, cleanup };
}

export async function seedTestData(surreal: Surreal) {
	// Create some test users
	await surreal.query(`
		CREATE user:alice SET
			name = { first: "Alice", last: "Smith" },
			age = 30,
			email = "alice@example.com",
			created = time::now(),
			updated = time::now();

		CREATE user:bob SET
			name = { first: "Bob", last: "Jones" },
			age = 25,
			email = "bob@example.com",
			created = time::now(),
			updated = time::now();

		CREATE user:charlie SET
			name = { first: "Charlie", last: "Brown" },
			age = 35,
			email = "charlie@example.com",
			created = time::now(),
			updated = time::now();
	`);

	// Create some test posts
	await surreal.query(`
		CREATE post:post1 SET
			title = "First Post",
			body = "This is the first post",
			author = user:alice,
			created = time::now(),
			updated = time::now();

		CREATE post:post2 SET
			title = "Second Post",
			body = "This is the second post",
			author = user:bob,
			created = time::now(),
			updated = time::now();
	`);

	// Create some relationships
	await surreal.query(`
		RELATE user:alice->authored->post:post1 SET
			created = time::now(),
			updated = time::now();

		RELATE user:bob->authored->post:post2 SET
			created = time::now(),
			updated = time::now();
	`);
}
