import { OrmError } from "../error";
import { type GetFunctions, getFunctions } from "../functions";
import type { MergeFields } from "../query/subject.ts";
import type { TableFieldsOf } from "../schema/traversal";
import type {
	AbstractType,
	ArrayType,
	GraphType,
	ObjectType,
	OptionType,
	RecordType,
	StringType,
	UnionType,
} from "../types";
import { type Workable, type WorkableContext, workableGet } from "./workable";

/**
 * The merged field map a record link `record<Tb>` exposes for property access:
 * a single table's fields, or the {@link MergeFields | merged} fields of a
 * multi-table link (`record<"a" | "b">`). Mirrors the runtime resolution in
 * `workableGet`'s `resolveAccessType`.
 */
type RecordFields<C extends WorkableContext, Tb extends string> =
	TableFieldsOf<C, Tb> extends ObjectType<infer O> ? MergeFields<O> : never;

/** Field props for an `option<Inner>`: like `Inner`'s, but each kept optional. */
type OptionalProps<C extends WorkableContext, Inner extends AbstractType> =
	Inner extends ObjectType<infer O>
		? { [K in keyof O]: Actionable<C, OptionType<O[K] & AbstractType>> }
		: [Inner] extends [RecordType<infer Tb extends string>]
			? {
					[K in keyof RecordFields<C, Tb>]: Actionable<
						C,
						OptionType<RecordFields<C, Tb>[K] & AbstractType>
					>;
				}
			: // arrays already yield optional elements; scalars have no props
				ActionableProps<C, Inner>;

export type ActionableProps<C extends WorkableContext, T extends AbstractType> =
	T extends OptionType<infer Inner>
		? OptionalProps<C, Inner>
		: T extends ObjectType<infer O>
			? { [K in keyof O]: Actionable<C, O[K]> }
			: [T] extends [RecordType<infer Tb extends string>]
				? {
						[K in keyof RecordFields<C, Tb>]: Actionable<
							C,
							RecordFields<C, Tb>[K] & AbstractType
						>;
					}
				: T extends GraphType<infer Tb>
					? TableFieldsOf<C, Tb> extends ObjectType<infer O>
						? { [K in keyof O]: Actionable<C, ArrayType<O[K]>> }
						: unknown
					: T extends ArrayType<infer A>
						? A extends AbstractType
							? {
									[K: number]: Actionable<C, OptionType<A>>;
								}
							: A extends AbstractType[]
								? {
										[K in keyof A as K extends keyof unknown[]
											? never
											: K]: A[K] extends AbstractType
											? Actionable<C, A[K]>
											: never;
									} & {
										[K: number]: Actionable<C, OptionType<UnionType<A>>>;
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
