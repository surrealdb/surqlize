import type { Orm } from "../schema";
import type { AbstractType } from "../types";
import {
	type DisplayContext,
	type Workable,
	type WorkableContext,
	__ctx,
	__display,
	__type,
	displayContext,
} from "../utils";

export abstract class Query<
	O extends Orm,
	T extends AbstractType = AbstractType,
> implements Workable<T>
{
	abstract [__ctx]: WorkableContext<O>;
	abstract [__display](ctx: DisplayContext): string;
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
		const ctx = displayContext();
		const query = this[__display](ctx);
		const [result] = await this[__ctx].orm.surreal.query<[this["type"]]>(
			query,
			ctx.variables,
		);
		return this.parse(result);
	}
}
