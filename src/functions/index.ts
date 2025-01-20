import type { AbstractType } from "../types";
import {
	type IntoWorkable,
	type Workable,
	type WorkableContext,
	__ctx,
	__display,
	__type,
} from "../utils";
import type { Actionable } from "../utils/actionable";
import * as typeFunctions from "./types";

const functions = {
	any: typeFunctions.any.functions,
	array: typeFunctions.array.functions,
	object: typeFunctions.object.functions,
	option: typeFunctions.option.functions,
	record: typeFunctions.record.functions,
	string: typeFunctions.string.functions,
} satisfies BaseFunctions;

interface BaseFunctions {
	any: typeFunctions.any.Functions;
	array: typeFunctions.array.Functions;
	object: typeFunctions.object.Functions;
	option: typeFunctions.option.Functions;
	record: typeFunctions.record.Functions;
	string: typeFunctions.string.Functions;
}

export type GetFunctions<
	C extends WorkableContext,
	T extends AbstractType,
> = BaseFunctions["any"] &
	(T["name"] extends keyof BaseFunctions
		? BaseFunctions[T["name"]]
		: Record<
				string,
				(...args: IntoWorkable<C>[]) => Actionable<C, AbstractType>
			>);

export function getFunctions<C extends WorkableContext, T extends AbstractType>(
	workable: Workable<C, T>,
): GetFunctions<C, T> {
	const fnc = { ...functions.any };

	if (workable[__type].name in functions) {
		Object.assign(fnc, functions[workable[__type].name as keyof BaseFunctions]);
	}

	for (const key in fnc) {
		fnc[key as "eq"] = fnc[key as "eq"].bind(workable) as (typeof fnc)["eq"];
	}

	return fnc as GetFunctions<C, T>;
}
