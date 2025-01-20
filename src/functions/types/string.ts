import {
	type BoolType,
	type NumberType,
	type StringType,
	t,
} from "../../types";
import {
	type IntoWorkable,
	type Workable,
	type WorkableContext,
	__ctx,
	intoWorkable,
} from "../../utils";
import type { Actionable } from "../../utils/actionable";
import { databaseFunction } from "../utils";

export const functions = {
	startsWith<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), v);
		return databaseFunction(
			this[__ctx],
			t.bool(),
			"string::starts_with",
			this,
			val,
		);
	},
	endsWith<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), v);
		return databaseFunction(
			this[__ctx],
			t.bool(),
			"string::ends_with",
			this,
			val,
		);
	},
	len<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.number(), "string::len", this);
	},
	join<C extends WorkableContext>(
		this: Workable<C, StringType>,
		separator: IntoWorkable<C, StringType>,
		...others: [IntoWorkable<C, StringType>, ...IntoWorkable<C, StringType>[]]
	) {
		const sep = intoWorkable(this[__ctx], t.string(), separator);
		const workables = others.map((p) =>
			intoWorkable(this[__ctx], t.string(), p),
		);
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::join",
			sep,
			this,
			...workables,
		);
	},
} satisfies Functions;

export type Functions = {
	startsWith<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, StringType>,
	): Actionable<C, BoolType>;
	endsWith<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, StringType>,
	): Actionable<C, BoolType>;
	len<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, NumberType>;
	join<C extends WorkableContext>(
		this: Workable<C, StringType>,
		separator: IntoWorkable<C, StringType>,
		...others: [IntoWorkable<C, StringType>, ...IntoWorkable<C, StringType>[]]
	): Actionable<C, StringType>;
};
