import { OrmError } from "../error";
import { type GetFunctions, getFunctions } from "../functions";
import type { AbstractType, ArrayType, ObjectType, StringType } from "../types";
import { type Workable, type WorkableContext, workableGet } from "./workable";

export type ActionableProps<C extends WorkableContext, T extends AbstractType> =
	T extends ObjectType<infer O>
		? { [K in keyof O]: Actionable<C, O[K]> }
		: T extends ArrayType<infer A>
			? A extends AbstractType
				? {
						[K: number]: Actionable<C, A>;
					}
				: A extends AbstractType[]
					? {
							[K in keyof A as K extends keyof unknown[]
								? never
								: K]: A[K] extends AbstractType ? Actionable<C, A[K]> : never;
						}
					: never
			: unknown;

export type Actionable<
	C extends WorkableContext,
	T extends AbstractType,
> = ActionableProps<C, T> & Workable<C, T> & GetFunctions<C, T>;

/**
 * Wrap a {@link Workable} in a `Proxy` that provides property access,
 * function bindings, and type-safe field traversal.
 *
 * @throws {OrmError} If a looked-up property exists in the function map but is not callable.
 */
export function actionable<
	C extends WorkableContext = WorkableContext,
	T extends AbstractType = StringType,
>(workable: Workable<C, T>): Actionable<C, T> {
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

				throw new OrmError(`Property ${prop} is not a function`);
			}

			return val;
		},
	}) as Actionable<C, T>;
}
