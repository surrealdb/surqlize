import type { AbstractType } from "../types";
import {
	__ctx,
	__display,
	__type,
	type DisplayContext,
	displayContext,
	type Workable,
	type WorkableContext,
} from "../utils";

/**
 * Abstract base class for all query types. Implements `Workable` so queries can
 * be composed as subqueries, and is Promise-like so queries can be directly
 * awaited to execute against SurrealDB.
 *
 * @typeParam C - The workable context (carries the ORM reference).
 * @typeParam T - The result type of the query.
 */
export abstract class Query<
	C extends WorkableContext = WorkableContext,
	T extends AbstractType = AbstractType,
> implements Workable<C, T>
{
	abstract [__ctx]: C;
	abstract [__display](ctx: DisplayContext): string;
	abstract [__type]: T;

	type = undefined as unknown as T["infer"];
	/** When true, result parsing is skipped (used by RETURN DIFF). */
	protected _skipParse = false;
	/** Type-guard that checks whether a value matches this query's result type. */
	validate(value: unknown): value is T["infer"] {
		return this[__type].validate(value);
	}

	/** Parse and validate a raw query result against this query's result type. */
	parse(value: unknown): T["infer"] {
		return this[__type].parse(value);
	}

	/**
	 * Normalize a raw query result into the public return value for this query.
	 * Most queries parse through the runtime schema, while a few modes such as
	 * `RETURN DIFF` intentionally bypass parse.
	 */
	parseResult(value: unknown): T["infer"] {
		if (this._skipParse) return value as T["infer"];
		return this.parse(value);
	}

	/** Create a shallow clone of this query. */
	clone(): this {
		return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
	}

	/**
	 * Return a shallow {@link clone} of this query with `mutate` applied to it.
	 *
	 * This is the basis of the immutable builder API: every chaining method
	 * (`.where()`, `.limit()`, …) derives a *new* query rather than mutating
	 * `this`, so a partially-built query can be safely reused as the base for
	 * several divergent queries without their state leaking into one another.
	 *
	 * Because the clone is shallow, `mutate` must replace mutable fields
	 * wholesale (e.g. `next._orderBy = [...next._orderBy ?? [], entry]`) instead
	 * of mutating them in place — an in-place `push`/property write would also
	 * affect the original query, which shares the same array/object references.
	 */
	protected derive(mutate: (draft: this) => void): this {
		const next = this.clone();
		mutate(next);
		return next;
	}

	/** Render the query as a SurrealQL string. */
	toString(): string {
		const ctx = displayContext();
		return this[__display]({
			...ctx,
			contextId: this[__ctx].id,
		});
	}

	[Symbol.toStringTag] = "Query";

	catch<TResult = never>(
		onRejected?:
			| ((reason: unknown) => TResult | PromiseLike<TResult>)
			| null
			| undefined,
	): Promise<this["type"] | TResult> {
		return this.then(undefined, onRejected);
	}

	finally(onFinally?: (() => void) | null | undefined): Promise<this["type"]> {
		return this.then(
			(value) => {
				onFinally?.();
				return value;
			},
			(reason) => {
				onFinally?.();
				throw reason;
			},
		);
	}

	// biome-ignore lint/suspicious/noThenProperty: entire point of the class
	get then(): Then<this> & ThenAccessors<this> {
		const fn = <TResult1 = this["type"], TResult2 = never>(
			onFulfilled?:
				| ((value: this["type"]) => TResult1 | PromiseLike<TResult1>)
				| undefined
				| null,
			onRejected?:
				| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
				| undefined
				| null,
		): Promise<TResult1 | TResult2> => {
			return this.execute().then(onFulfilled, onRejected);
		};

		// Convenience accessors that execute the query and index into the
		// resolved result array client-side. All queries return arrays, so these
		// extract a single record. See README "Accessing Single Records".
		const val = (): Promise<ResultElement<this["type"]> | undefined> =>
			this.execute().then(
				(result) =>
					(Array.isArray(result) ? result.at(0) : result) as
						| ResultElement<this["type"]>
						| undefined,
			);

		const at = (
			index: number,
		): Promise<ResultElement<this["type"]> | undefined> =>
			this.execute().then(
				(result) =>
					(Array.isArray(result) ? result.at(index) : undefined) as
						| ResultElement<this["type"]>
						| undefined,
			);

		return Object.assign(fn, { val, at }) as Then<this> & ThenAccessors<this>;
	}

	/** Execute the query against SurrealDB and return the parsed result. */
	async execute() {
		const ctx = displayContext();
		const query = this[__display](ctx);
		const [result] = await this[__ctx].orm.surreal.query<[this["type"]]>(
			query,
			ctx.variables,
		);
		return this.parseResult(result);
	}
}

type Then<Q extends Query> = <TResult1 = Q["type"], TResult2 = never>(
	onFulfilled?:
		| ((value: Q["type"]) => TResult1 | PromiseLike<TResult1>)
		| undefined
		| null,
	onRejected?:
		| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
		| undefined
		| null,
) => Promise<TResult1 | TResult2>;

/** The element type of an array result, or the result itself if not an array. */
type ResultElement<T> = T extends readonly (infer E)[] ? E : T;

/**
 * Convenience accessors hung off {@link Query.then} for reaching into a query's
 * result array without first awaiting it into a variable.
 */
type ThenAccessors<Q extends Query> = {
	/** Execute the query and resolve to the first result, or `undefined`. */
	val(): Promise<ResultElement<Q["type"]> | undefined>;
	/**
	 * Execute the query and resolve to the result at `index`, or `undefined`.
	 * Negative indexes count from the end (e.g. `-1` is the last result).
	 */
	at(index: number): Promise<ResultElement<Q["type"]> | undefined>;
};
