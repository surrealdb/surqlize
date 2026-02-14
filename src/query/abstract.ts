import type { AbstractType } from "../types";
import {
	type DisplayContext,
	type Workable,
	type WorkableContext,
	__ctx,
	__display,
	__type,
	displayContext,
	sanitizeWorkable,
} from "../utils";
import { type Actionable, actionable } from "../utils/actionable";

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
	/** When true, execute() skips schema parsing (used by RETURN DIFF). */
	protected _returnsDiff = false;
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
	get then(): Then<this> & Actionable<C, T> {
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

		const workable = sanitizeWorkable(this);
		const functions = actionable(workable);
		return Object.assign(fn, functions) as Then<this> & Actionable<C, T>;
	}

	/** Execute the query against SurrealDB and return the parsed result. */
	async execute() {
		const ctx = displayContext();
		const query = this[__display](ctx);
		const [result] = await this[__ctx].orm.surreal.query<[this["type"]]>(
			query,
			ctx.variables,
		);
		// RETURN DIFF produces JsonPatchOp[], not a schema-conforming record
		if (this._returnsDiff) return result as this["type"];
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
