import {
	type AbstractType,
	type ObjectType,
	type RecordType,
	t,
} from "../types";
import { TableSchema } from "./table";

export type EdgeFields = Record<
	Exclude<string, "id" | "in" | "out">,
	AbstractType
>;

type GetEdgeSchemaType<
	From extends string,
	Tb extends string,
	To extends string,
	Fd extends EdgeFields,
> = ObjectType<
	Fd & {
		id: RecordType<Tb>;
		in: RecordType<From>;
		out: RecordType<To>;
	}
>;

type GetEdgeInferType<
	From extends string,
	Tb extends string,
	To extends string,
	Fd extends EdgeFields,
> = GetEdgeSchemaType<From, Tb, To, Fd>["infer"];

export class EdgeSchema<
	From extends string = string,
	Tb extends string = string,
	To extends string = string,
	Fd extends EdgeFields = EdgeFields,
> {
	constructor(
		public readonly from: From,
		public readonly tb: Tb,
		public readonly to: To,
		public readonly _fields: Fd,
	) {}

	get fields(): Fd & {
		id: RecordType<Tb>;
		in: RecordType<From>;
		out: RecordType<To>;
	} & {} {
		return {
			...this._fields,
			id: t.record(this.tb as string),
			in: t.record(this.from as string),
			out: t.record(this.to as string),
		} as Fd & {
			id: RecordType<Tb>;
			in: RecordType<From>;
			out: RecordType<To>;
		} & {};
	}

	type = undefined as unknown as GetEdgeInferType<From, Tb, To, Fd>;

	get schema(): GetEdgeSchemaType<From, Tb, To, Fd> {
		return t.object(this.fields);
	}

	validate(value: unknown): value is GetEdgeInferType<From, Tb, To, Fd> {
		return this.schema.validate(value);
	}
}

export function edge<
	From extends string,
	Tb extends string,
	To extends string,
	Fd extends Record<Exclude<string, "id" | "in" | "out">, AbstractType>,
>(
	from: From extends string ? From : never,
	tb: Tb extends string ? Tb : never,
	to: To extends string ? To : never,
	fields: Fd,
) {
	return new EdgeSchema(from, tb, to, fields);
}
