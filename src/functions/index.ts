import type { AbstractType, ArrayType, NumberType } from "../types";
import {
	__type,
	type IntoWorkable,
	type Workable,
	type WorkableContext,
} from "../utils";
import type { Actionable } from "../utils/actionable";
import * as typeFunctions from "./types";

const functions = {
	any: typeFunctions.any.functions,
	array: {
		...typeFunctions.array.functions,
		...typeFunctions.array.vectorFunctions,
	},
	date: typeFunctions.date.functions,
	graph: typeFunctions.graph.functions,
	number: typeFunctions.number.functions,
	option: typeFunctions.option.functions,
	point: {},
	record: typeFunctions.record.functions,
	string: typeFunctions.string.functions,
} satisfies BaseFunctions;

interface BaseFunctions {
	any: typeFunctions.any.Functions;
	array: typeFunctions.array.Functions;
	date: typeFunctions.date.Functions;
	graph: typeFunctions.graph.Functions;
	number: typeFunctions.number.Functions;
	option: typeFunctions.option.Functions;
	point: object;
	record: typeFunctions.record.Functions;
	string: typeFunctions.string.Functions;
}

export type GetFunctions<
	C extends WorkableContext,
	T extends AbstractType,
> = BaseFunctions["any"] &
	// `knn()` exists only on a vector: an `array<number>`.
	(T extends ArrayType<NumberType>
		? typeFunctions.array.VectorFunctions
		: unknown) &
	// An `option<T>` exposes only its own `option` functions (`map`, `unwrap`, …).
	// Field/index access through the option resolves transparently (see
	// `ActionableProps`); to call a *type-specific* method on the inner value
	// (e.g. `.at()` on an `option<array>`), `unwrap()` it first.
	(T["name"] extends keyof BaseFunctions
		? BaseFunctions[T["name"]]
		: Record<
				string,
				(...args: IntoWorkable<C>[]) => Actionable<C, AbstractType>
			>);

/** Merged (unbound) function tables, one per type name: they never change. */
const tables = new Map<string, Record<string, (...args: never[]) => unknown>>();

/**
 * The unbound function table for a type: the `any` functions overlaid with the
 * type-specific ones. Built once per type name and shared, so it must not be
 * mutated. Bind a function to its workable before calling it.
 */
export function functionTable(
	typeName: string,
): Record<string, (...args: never[]) => unknown> {
	let table = tables.get(typeName);
	if (!table) {
		table = { ...functions.any };
		if (typeName in functions) {
			Object.assign(table, functions[typeName as keyof BaseFunctions]);
		}
		tables.set(typeName, table);
	}
	return table;
}

export function getFunctions<C extends WorkableContext, T extends AbstractType>(
	workable: Workable<C, T>,
): GetFunctions<C, T> {
	const fnc: Record<string, unknown> = {};
	const table = functionTable(workable[__type].name);

	for (const key in table) {
		fnc[key] = table[key]!.bind(workable);
	}

	return fnc as GetFunctions<C, T>;
}
