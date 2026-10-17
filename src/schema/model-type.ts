import { type AbstractType, ObjectType } from "../types";
import type { ModelClass } from "../utils/model";
import {
	hydrateModelRow,
	MODEL_SCHEMA,
	type ModelSchemaMetadata,
} from "./model";

/**
 * The object type of a table linked to a class: rows parse into instances of
 * the class, and the inferred type is the row fields plus the class instance.
 */
// Internal: reachable by type through `TableSchema.schema`, but not part of the
// package's named exports.
export class ModelType<
	Fd extends Record<string, AbstractType> = Record<string, AbstractType>,
	I = unknown,
> extends ObjectType<Fd> {
	declare infer: ObjectType<Fd>["infer"] & I;
	declare accept: ObjectType<Fd>["accept"] &
		Omit<I, keyof ObjectType<Fd>["infer"]>;
	readonly [MODEL_SCHEMA]: ModelSchemaMetadata;

	constructor(
		fields: Fd,
		readonly model: ModelClass,
		readonly tb: string,
		readonly usesModelBase: boolean,
	) {
		super(fields);
		this[MODEL_SCHEMA] = { tb, model, usesModelBase };
	}

	/** Parse a row, then hydrate it into an instance of the linked class. */
	parse(value: unknown): this["infer"] {
		const row = super.parse(value);
		return hydrateModelRow(
			this.model,
			this.tb,
			this.usesModelBase,
			row,
		) as this["infer"];
	}
}
