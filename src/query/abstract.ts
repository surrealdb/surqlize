import type { Orm } from "../schema";
import type { AbstractType } from "../types";
import {
	type DisplayUtils,
	type Workable,
	__display,
	__orm,
	__type,
	createDisplayUtils,
} from "../utils";

export abstract class Query<
	O extends Orm,
	T extends AbstractType = AbstractType,
> implements Workable<T>
{
	abstract [__orm]: O;
	abstract [__display](utils: DisplayUtils): string;
	abstract [__type]: T;

	type = undefined as unknown as T["infer"];
	validate(value: unknown): value is T["infer"] {
		return this[__type].validate(value);
	}

	parse(value: unknown): T["infer"] {
		return this[__type].parse(value);
	}

	clone(): this {
		return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
	}

	toString(): string {
		const utils = createDisplayUtils();
		return this[__display](utils);
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
	then<TResult1 = this["type"], TResult2 = never>(
		onFulfilled?:
			| ((value: this["type"]) => TResult1 | PromiseLike<TResult1>)
			| undefined
			| null,
		onRejected?:
			| ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
			| undefined
			| null,
	): Promise<TResult1 | TResult2> {
		return this.execute().then(onFulfilled, onRejected);
	}

	async execute() {
		const utils = createDisplayUtils();
		const query = this[__display](utils);
		const [result] = await this[__orm].surreal.query<[this["type"]]>(
			query,
			utils.variables,
		);
		return this.parse(result);
	}
}
