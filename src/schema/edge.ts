import { type AbstractType, type RecordType, t } from "../types";
import { TableSchema } from "./table";

export type EdgeFields = Record<
	Exclude<string, "id" | "in" | "out">,
	AbstractType
>;

export class EdgeSchema<
	From extends string = string,
	Tb extends string = string,
	To extends string = string,
	Fd extends EdgeFields = EdgeFields,
> extends TableSchema<Tb, Fd> {
	constructor(
		public readonly from: From,
		tb: Tb,
		public readonly to: To,
		_fields: Fd,
	) {
		super(tb, _fields);
	}

	get fields(): Fd & {
		in: RecordType<From>;
		id: RecordType<Tb>;
		out: RecordType<To>;
	} & {} {
		return {
			...this._fields,
			in: t.record(this.from as string),
			id: t.record(this.tb as string),
			out: t.record(this.to as string),
		} as Fd & {
			in: RecordType<From>;
			id: RecordType<Tb>;
			out: RecordType<To>;
		} & {};
	}
}

export function edge<
	From extends string = string,
	Tb extends string = string,
	To extends string = string,
	Fd extends EdgeFields = EdgeFields,
>(
	from: From extends string ? From : never,
	tb: Tb extends string ? Tb : never,
	to: To extends string ? To : never,
	fields: Fd,
) {
	return new EdgeSchema(from, tb, to, fields);
}
