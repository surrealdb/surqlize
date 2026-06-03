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
	/** When true, execute() skips schema parsing (used by RETURN DIFF and FETCH). */
	protected _skipParse = false;
	/** Type-guard that checks whether a value matches this query's result type. */
	validate(value: unknown): value is T["infer"] {
		return this[__type].validate(value);
	}

	/** Parse and validate a raw query result against this query's result type. */
	parse(value: unknown): T["infer"] {
		return this[__type].parse(value);
	}

	/** Create a shallow clone of this query. */
	clone(): this {
		return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
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
		// Skip parse for RETURN DIFF (JsonPatchOp[]) and FETCH (resolved records)
		if (this._skipParse) return result as this["type"];
		return this.parse(result);
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
