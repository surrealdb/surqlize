import { type AbstractType, ObjectType } from "../types";
import type { ModelClass } from "../utils/model";

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
	declare accept: ObjectType<Fd>["accept"] & I;

	constructor(
		fields: Fd,
		readonly model: ModelClass,
	) {
		super(fields);
	}

	/** Parse a row, then hydrate it into an instance of the linked class. */
	parse(value: unknown): this["infer"] {
		const row = super.parse(value);
		return Object.assign(Object.create(this.model.prototype), row);
	}
}
