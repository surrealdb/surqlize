import { type GetFunctions, getFunctions } from "../functions";
import type { AbstractType, ArrayType, ObjectType, StringType } from "../types";
import { type Workable, __type, intoWorkable, workableGet } from "./workable";

export type ActionableProps<T extends AbstractType> = T extends ObjectType<
	infer O
>
	? { [K in keyof O]: Actionable<O[K]> }
	: T extends ArrayType<infer A>
		? A extends AbstractType
			? {
					[K: number]: Actionable<A>;
				}
			: A extends AbstractType[]
				? {
						[K in keyof A as K extends keyof Array<unknown>
							? never
							: K]: A[K] extends AbstractType ? Actionable<A[K]> : never;
					}
				: never
		: unknown;

export type Actionable<T extends AbstractType> = ActionableProps<T> &
	Workable<T> &
	GetFunctions<T>;

export function actionable<T extends AbstractType = StringType>(
	workable: Workable<T>,
): Actionable<T> {
	const functions = getFunctions(workable);

	return new Proxy(functions, {
		get(target, prop) {
			if (typeof prop === "symbol") {
				return workable[prop as keyof typeof workable];
			}

			const res = workableGet(workable, prop);
			const val = actionable(res);

			if (prop in functions) {
				const fn = target[prop as keyof typeof target];

				if (typeof fn === "function") {
					return Object.assign(fn, {
						valueOf() {
							return val;
						},
					});
				}

				throw new Error(`Property ${prop} is not a function`);
			}

			return val;
		},
	}) as Actionable<T>;
}
