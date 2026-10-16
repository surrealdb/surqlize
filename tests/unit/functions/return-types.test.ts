import { describe, test } from "bun:test";
import { type Duration, Surreal, type Uuid } from "surrealdb";
import { __type, duration, orm, rand, vector } from "../../../src";

// Type-level checks: each assertion fails `tsc` if the declared return type of
// a standalone function drifts from what SurrealDB returns for it. The runtime
// types are checked against a live server in tests/integration.

type Equal<A, B> =
	(<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
		? true
		: false;
const assertType = <_T extends true>() => {};
type InferOf<X> = X extends { [__type]: { infer: infer I } } ? I : never;

const db = orm(new Surreal());
const src = db.value(1);
const vec = db.value([1, 2, 3]);

describe("standalone function return types", () => {
	test("rand.uuid() returns a uuid, not a string", () => {
		const id = rand.uuid(src);
		assertType<Equal<InferOf<typeof id>, Uuid>>();
	});

	test("duration.from*() factories return a duration, not a string", () => {
		const fromDays = duration.fromDays(src);
		const fromSecs = duration.fromSecs(src);
		const fromMillis = duration.fromMillis(src);
		assertType<Equal<InferOf<typeof fromDays>, Duration>>();
		assertType<Equal<InferOf<typeof fromSecs>, Duration>>();
		assertType<Equal<InferOf<typeof fromMillis>, Duration>>();
	});

	test("duration.max returns a duration", () => {
		const max = duration.max(src);
		assertType<Equal<InferOf<typeof max>, Duration>>();
	});

	test("vector operations that return vectors are typed as number arrays", () => {
		const sum = vector.add(vec, vec);
		const normalized = vector.normalize(vec);
		assertType<Equal<InferOf<typeof sum>, number[]>>();
		assertType<Equal<InferOf<typeof normalized>, number[]>>();

		const difference = vector.subtract(vec, vec);
		const product = vector.multiply(vec, vec);
		const quotient = vector.divide(vec, vec);
		const crossed = vector.cross(vec, vec);
		const projected = vector.project(vec, vec);
		assertType<Equal<InferOf<typeof difference>, number[]>>();
		assertType<Equal<InferOf<typeof product>, number[]>>();
		assertType<Equal<InferOf<typeof quotient>, number[]>>();
		assertType<Equal<InferOf<typeof crossed>, number[]>>();
		assertType<Equal<InferOf<typeof projected>, number[]>>();
	});

	test("vector operations that return a scalar are typed as numbers", () => {
		const angle = vector.angle(vec, vec);
		const dot = vector.dot(vec, vec);
		assertType<Equal<InferOf<typeof angle>, number>>();
		assertType<Equal<InferOf<typeof dot>, number>>();
	});
});
