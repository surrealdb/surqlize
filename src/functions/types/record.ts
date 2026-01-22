import type { SelectQuery } from "../../query/select";
import type { RecordType } from "../../types";
import {
	type Workable,
	type WorkableContext,
	__ctx,
	__display,
	__type,
} from "../../utils";

export const functions = {
	select<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(this: Workable<C, RecordType<Tb>>) {
		return this[__ctx].orm.select(this);
	},

	to<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		To extends C["orm"]["lookup"]["to"][Tb] extends readonly (infer E)[]
			? E
			: never,
	>(this: Workable<C, RecordType<Tb>>, to: To) {
		return to;
	},

	from<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		From extends C["orm"]["lookup"]["from"][Tb] extends readonly (infer E)[]
			? E
			: never,
	>(this: Workable<C, RecordType<Tb>>, from: From) {
		return from;
	},
} satisfies Functions;

export type Functions = {
	select<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
	>(this: Workable<C, RecordType<Tb>>): SelectQuery<C["orm"], C, Tb>;

	to<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		To extends C["orm"]["lookup"]["to"][Tb] extends readonly (infer E)[]
			? E
			: never,
	>(this: Workable<C, RecordType<Tb>>, to: To): To;

	from<
		C extends WorkableContext,
		Tb extends keyof C["orm"]["tables"] & string,
		From extends C["orm"]["lookup"]["from"][Tb] extends readonly (infer E)[]
			? E
			: never,
	>(this: Workable<C, RecordType<Tb>>, from: From): From;
};
