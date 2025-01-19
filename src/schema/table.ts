import {
	type AbstractType,
	type ObjectType,
	type RecordType,
	t,
} from "../types";

export type TableFields = Record<Exclude<string, "id">, AbstractType>;

type GetSchemaType<Tb extends string, Fd extends TableFields> = ObjectType<
	Fd & { id: RecordType<Tb> }
>;

type GetInferType<Tb extends string, Fd extends TableFields> = GetSchemaType<
	Tb,
	Fd
>["infer"];

export class TableSchema<
	Tb extends string = string,
	Fd extends TableFields = TableFields,
> {
	constructor(
		public readonly tb: Tb,
		public readonly _fields: Fd,
	) {}

	get fields(): Fd & { id: RecordType<Tb> } & {} {
		return {
			...this._fields,
			id: t.record(this.tb as string),
		} as Fd & { id: RecordType<Tb> } & {};
	}

	type = undefined as unknown as GetInferType<Tb, Fd>;

	get schema(): GetSchemaType<Tb, Fd> {
		return t.object(this.fields);
	}

	validate(value: unknown): value is GetInferType<Tb, Fd> {
		return this.schema.validate(value);
	}
}

export function table<
	Tb extends string,
	Fd extends Record<Exclude<string, "id">, AbstractType>,
>(tb: Tb extends string ? Tb : never, fields: Fd) {
	return new TableSchema(tb, fields);
}
