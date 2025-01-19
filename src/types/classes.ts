import { RecordId, Uuid } from "surrealdb";
import { TypeParseError } from "../error";

export abstract class AbstractType<T = unknown> {
	abstract readonly name: string;
	abstract readonly expected: string | [string, string, ...string[]];

	infer = undefined as unknown as T;
	accept = undefined as unknown as T;
	abstract validate(value: unknown): value is T;

	parse(value: unknown): T {
		if (!this.validate(value))
			throw new TypeParseError(this.name, this.expected, value);
		return value as T;
	}

	get(prop: string | number): [AbstractType, string] {
		return [new NoneType(), `[${JSON.stringify(prop)}]`];
	}
}

export class LiteralType<
	T extends string | number | boolean,
> extends AbstractType<T> {
	name = "literal" as const;
	get expected() {
		return `\`${this.value}\``;
	}

	constructor(private _value: T) {
		super();
	}

	get value() {
		return this._value;
	}

	validate(value: unknown): value is this["infer"] {
		return value === this.value;
	}
}

export class StringType extends AbstractType<string> {
	name = "string" as const;
	expected = "string";

	validate(value: unknown): value is this["infer"] {
		return typeof value === "string";
	}
}

export class NumberType extends AbstractType<number> {
	name = "number" as const;
	expected = "number";

	validate(value: unknown): value is this["infer"] {
		return typeof value === "number";
	}
}

export class BoolType extends AbstractType<boolean> {
	name = "bool" as const;
	expected = "boolean";

	validate(value: unknown): value is this["infer"] {
		return typeof value === "boolean";
	}
}

export class NullType extends AbstractType<null> {
	name = "null" as const;
	expected = "null";

	validate(value: unknown): value is this["infer"] {
		return value === null;
	}
}

export class NoneType extends AbstractType<undefined> {
	name = "none" as const;
	expected = "undefined";

	validate(value: unknown): value is this["infer"] {
		return value === undefined;
	}
}

export class NeverType extends AbstractType<never> {
	name = "never" as const;
	expected = "never";

	validate(_: unknown): _ is never {
		// biome-ignore lint/style/noArguments: No other way to do this check
		return arguments.length === 0;
	}
}

export class DateType extends AbstractType<Date> {
	name = "date" as const;
	expected = "Date";
	validate(value: unknown): value is this["infer"] {
		return value instanceof Date;
	}
}

export class UuidType extends AbstractType<Uuid> {
	name = "uuid" as const;
	expected = "Uuid";

	validate(value: unknown): value is this["infer"] {
		return value instanceof Uuid;
	}
}

export class OptionType<T extends AbstractType> extends AbstractType<
	T["infer"] | undefined
> {
	name = "option" as const;
	get expected() {
		return `Option<${this.schema.expected}>`;
	}

	constructor(private _schema: T) {
		super();
	}

	get schema() {
		return this._schema;
	}

	validate(value: unknown): value is this["infer"] {
		return value === undefined || this.schema.validate(value);
	}
}

export class RecordType<
	Tb extends string | undefined = undefined,
> extends AbstractType<RecordId<Tb extends string ? Tb : string>> {
	name = "record" as const;
	get expected() {
		if (this.tb === undefined) return "RecordId";
		return `RecordId<${this.tb}>`;
	}

	constructor(private _tb: Tb) {
		super();
	}

	get tb() {
		return this._tb;
	}

	validate(value: unknown): value is this["infer"] {
		if (!(value instanceof RecordId)) return false;
		if (this.tb === undefined) return true;
		return value.tb === this.tb;
	}
}

export type ObjectTypeInner = Record<string, AbstractType>;
export class ObjectType<
	T extends ObjectTypeInner = ObjectTypeInner,
> extends AbstractType<
	{
		[K in keyof T]: T[K]["infer"];
	} & {}
> {
	name = "object" as const;
	get expected() {
		let str = "{";
		for (const [key, val] of Object.entries(this.schema)) {
			str += ` ${key}: ${val.expected},`;
		}
		return `${str} }`;
	}

	constructor(private _schema: T) {
		super();
	}

	get schema() {
		return this._schema;
	}

	validate(value: unknown): value is this["infer"] {
		if (typeof value !== "object" || value === null) return false;
		for (const key in this.schema) {
			if (!this.schema[key].validate((value as this["infer"])[key]))
				return false;
		}
		return true;
	}

	parse(value: unknown): this["infer"] {
		if (typeof value !== "object" || value === null)
			throw new TypeParseError(this.name, this.expected, value);
		for (const key in this.schema) {
			this.schema[key].parse((value as this["infer"])[key]);
		}

		return value as this["infer"];
	}

	get(prop: string | number): [AbstractType, string] {
		if (prop in this.schema) {
			return [this.schema[prop as keyof T], `[${JSON.stringify(prop)}]`];
		}

		return [new NoneType(), `[${JSON.stringify(prop)}]`];
	}
}

export class ArrayType<
	T extends AbstractType[] | AbstractType = AbstractType[] | AbstractType,
> extends AbstractType<
	T extends AbstractType[]
		? { [K in keyof T]: T[K] extends AbstractType ? T[K]["infer"] : never }
		: T extends AbstractType
			? T["infer"][]
			: never
> {
	name = "array" as const;
	get expected() {
		let str = "[";
		if (Array.isArray(this.schema)) {
			for (const val of this.schema) {
				str += ` ${val.expected},`;
			}
		} else {
			str += ` ${this.schema.expected},`;
		}
		return `${str} ]`;
	}

	constructor(private _schema: T) {
		super();
	}

	get schema() {
		return this._schema;
	}

	validate(value: unknown): value is this["infer"] {
		if (!Array.isArray(value)) return false;
		if (Array.isArray(this.schema)) {
			if (this.schema.length !== value.length) return false;
			for (let i = 0; i < this.schema.length; i++) {
				if (!this.schema[i].validate(value[i])) return false;
			}
		} else {
			for (const item of value) {
				if (!this.schema.validate(item)) return false;
			}
		}
		return true;
	}

	parse(value: unknown): this["infer"] {
		if (!Array.isArray(value))
			throw new TypeParseError(this.name, this.expected, value);
		if (Array.isArray(this.schema)) {
			if (this.schema.length !== value.length)
				throw new TypeParseError(this.name, this.expected, value);
			for (let i = 0; i < this.schema.length; i++) {
				this.schema[i].parse(value[i]);
			}
		} else {
			for (const item of value) {
				this.schema.parse(item);
			}
		}
		return value as this["infer"];
	}

	get(prop: number): [AbstractType, string] {
		const i = Number.parseInt(prop as unknown as string);
		if (Array.isArray(this.schema)) {
			if (i in this.schema) {
				return [this.schema[i as keyof T], `[${JSON.stringify(i)}]`];
			}
		} else {
			return [
				new UnionType([this.schema, new NoneType()]),
				`[${JSON.stringify(i)}]`,
			];
		}

		return [new NoneType(), `[${JSON.stringify(i)}]`];
	}
}

export class UnionType<T extends AbstractType[]> extends AbstractType<
	T extends AbstractType[]
		? {
				[K in keyof T]: T[K] extends AbstractType ? T[K]["infer"] : never;
			}[number]
		: never
> {
	name = "union" as const;
	get expected() {
		return this.schema.map((val) => val.expected) as [
			string,
			string,
			...string[],
		];
	}

	constructor(private _schema: T) {
		super();
	}

	get schema() {
		return this._schema;
	}

	validate(value: unknown): value is this["infer"] {
		for (const schema of this.schema) {
			if (schema.validate(value)) return true;
		}
		return false;
	}
}
