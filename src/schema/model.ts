import { RecordId } from "surrealdb";
import { OrmError } from "../error";
import type { CreateQuery } from "../query/create";
import type { DeleteQuery } from "../query/delete";
import type { InsertQuery } from "../query/insert";
import type { SelectQuery } from "../query/select";
import type { UpdateQuery } from "../query/update";
import type { UpsertQuery } from "../query/upsert";
import type {
	AbstractType,
	ArrayType,
	ObjectType,
	OptionType,
	RecordType,
	SetType,
	UnionType,
} from "../types";
import {
	ArrayType as ArrayTypeClass,
	ObjectType as ObjectTypeClass,
	OptionType as OptionTypeClass,
	SetType as SetTypeClass,
	UnionType as UnionTypeClass,
} from "../types";
import type { WorkableContext } from "../utils";
import { type ModelClass, registerModelClass } from "../utils/model";
import type { ModelType } from "./model-type";
import type { Orm } from "./orm";

// biome-ignore lint/suspicious/noExplicitAny: model classes are defined before their ORM schema is known.
type UnboundOrm = Orm<any>;

/** Internal marker carried by model-linked object schemas. */
export const MODEL_SCHEMA = Symbol("surqlize.model.schema");
const MODEL_BASE_INSTANCE = Symbol("surqlize.model.base.instance");

export type IsModelBaseInstance<T> = T extends {
	readonly [MODEL_BASE_INSTANCE]: true;
}
	? true
	: false;

export type ModelSchemaMetadata = {
	tb: string;
	model: ModelClass;
	usesModelBase: boolean;
};

/** The shape of a record accepted by a model hydration factory. */
type MaterializedRecord<Tb> = {
	id: RecordId<Tb extends string ? Tb : string>;
} & Record<string, unknown>;

/**
 * A schema's accepted values, widened so record links can also arrive as
 * materialized objects when a query uses FETCH.
 */
export type HydrationInput<T extends AbstractType> =
	T extends ObjectType<infer Fields extends Record<string, AbstractType>>
		? { [K in keyof Fields]: HydrationInput<Fields[K]> }
		: T extends OptionType<infer Inner extends AbstractType>
			? HydrationInput<Inner> | undefined
			: T extends ArrayType<infer Items>
				? Items extends AbstractType[]
					? {
							[K in keyof Items]: Items[K] extends AbstractType
								? HydrationInput<Items[K]>
								: never;
						}
					: Items extends AbstractType
						? HydrationInput<Items>[]
						: never
				: T extends SetType<infer Item extends AbstractType>
					? Set<HydrationInput<Item>>
					: T extends RecordType<infer Tb>
						? T["infer"] | MaterializedRecord<Tb>
						: T extends UnionType<infer Members extends AbstractType[]>
							? HydrationInput<Members[number]>
							: T["infer"];

export type ModelSchema = {
	tb: string;
	schema: ObjectType;
	type: object;
};

type ModelTableName<O extends UnboundOrm, S extends ModelSchema> = S["tb"] &
	(keyof O["tables"] & string);

type ModelSchemaForClass<S extends ModelSchema, C extends ModelClass> = Omit<
	S,
	"schema" | "type"
> & {
	schema: S["schema"] extends ObjectType<infer F>
		? ModelType<F, InstanceType<C>>
		: S["schema"];
	type: InstanceType<C>;
};

type ModelSelect<
	O extends UnboundOrm,
	S extends ModelSchema,
	C extends ModelClass,
> = SelectQuery<
	O,
	WorkableContext<O>,
	ModelTableName<O, S>,
	ModelSchemaForClass<S, C>["schema"]
>;
type ModelCreate<
	O extends UnboundOrm,
	S extends ModelSchema,
	C extends ModelClass,
> = CreateQuery<
	O,
	WorkableContext<O>,
	ModelTableName<O, S>,
	ModelSchemaForClass<S, C>["schema"]
>;
type ModelInsert<
	O extends UnboundOrm,
	S extends ModelSchema,
	C extends ModelClass,
> = InsertQuery<
	O,
	WorkableContext<O>,
	ModelTableName<O, S>,
	ModelSchemaForClass<S, C>["schema"]
>;
type ModelUpdate<
	O extends UnboundOrm,
	S extends ModelSchema,
	C extends ModelClass,
> = UpdateQuery<
	O,
	WorkableContext<O>,
	ModelTableName<O, S>,
	ModelSchemaForClass<S, C>["schema"]
>;
type ModelUpsert<
	O extends UnboundOrm,
	S extends ModelSchema,
	C extends ModelClass,
> = UpsertQuery<
	O,
	WorkableContext<O>,
	ModelTableName<O, S>,
	ModelSchemaForClass<S, C>["schema"]
>;
type ModelDelete<
	O extends UnboundOrm,
	S extends ModelSchema,
	C extends ModelClass,
> = DeleteQuery<
	O,
	WorkableContext<O>,
	ModelTableName<O, S>,
	ModelSchemaForClass<S, C>["schema"]
>;

type ModelHelperKey = "$orm" | "select" | "update" | "delete";

// biome-ignore lint/suspicious/noExplicitAny: the inferred constructor is never invoked.
type ModelClassFor<I extends object> = abstract new (...args: any[]) => I;

/** The instance shape shared by a table's generated model base and attached class. */
export type ModelInstance<
	S extends ModelSchema,
	O extends UnboundOrm = UnboundOrm,
> = Omit<S["type"], ModelHelperKey> & ModelBase<S, O>;

/** Shared instance helpers for classes created by `table.model()`. */
export class ModelBase<
	S extends ModelSchema,
	O extends UnboundOrm = UnboundOrm,
> {
	// Keep concrete model instances assignable to wider table schema types.
	[key: string]: unknown;
	declare readonly [MODEL_BASE_INSTANCE]: true;
	declare readonly $orm: O;

	select<I extends object>(
		this: I & ModelBase<S, O>,
	): ModelSelect<O, S, ModelClassFor<I>> {
		const context = modelContextFor<O>(this);
		return context.orm.select(modelId(this, context.tb)) as ModelSelect<
			O,
			S,
			ModelClassFor<I>
		>;
	}

	update<I extends object>(
		this: I & ModelBase<S, O>,
	): ModelUpdate<O, S, ModelClassFor<I>> {
		const context = modelContextFor<O>(this);
		return context.orm.update(modelId(this, context.tb)) as ModelUpdate<
			O,
			S,
			ModelClassFor<I>
		>;
	}

	delete<I extends object>(
		this: I & ModelBase<S, O>,
	): ModelDelete<O, S, ModelClassFor<I>> {
		const context = modelContextFor<O>(this);
		return context.orm.delete(modelId(this, context.tb)) as ModelDelete<
			O,
			S,
			ModelClassFor<I>
		>;
	}
}

Object.defineProperty(ModelBase.prototype, "$orm", {
	configurable: false,
	enumerable: false,
	get(this: object) {
		return modelContextFor(this).orm;
	},
});

/** Static query builders available to an attached model class. */
export interface ModelStaticOperations<
	O extends UnboundOrm,
	S extends ModelSchema,
> {
	readonly $orm: O;
	select<C extends ModelClass>(this: C): ModelSelect<O, S, C>;
	create<C extends ModelClass>(this: C): ModelCreate<O, S, C>;
	insert<C extends ModelClass>(
		this: C,
		data?: unknown | unknown[],
	): ModelInsert<O, S, C>;
	update<C extends ModelClass>(this: C): ModelUpdate<O, S, C>;
	upsert<C extends ModelClass>(this: C): ModelUpsert<O, S, C>;
	delete<C extends ModelClass>(this: C): ModelDelete<O, S, C>;
}

/** Constructor contract for classes attached through `table.attach()`. */
export type ModelConstructor<S extends ModelSchema> = {
	// biome-ignore lint/suspicious/noExplicitAny: custom models may have constructor arguments
	new (...args: any[]): ModelInstance<S>;
	hydrate(record: HydrationInput<S["schema"]>): ModelInstance<S>;
};

/** Constructor shape used by the ORM's per-connection model cache. */
export type AnyModelConstructor = {
	// biome-ignore lint/suspicious/noExplicitAny: custom models may have constructor arguments
	new (...args: any[]): object;
	// biome-ignore lint/suspicious/noExplicitAny: custom hydration factories accept their own record types.
	hydrate?: (...args: any[]) => object;
};

/** Constructor returned from `table.model()`. */
export type ModelBaseConstructor<S extends ModelSchema> = {
	// biome-ignore lint/suspicious/noExplicitAny: subclasses may add constructor arguments
	new (...args: any[]): ModelInstance<S>;
	prototype: ModelInstance<S>;
	hydrate(record: HydrationInput<S["schema"]>): ModelInstance<S>;
} & ModelStaticOperations<UnboundOrm, S>;

/** An instance returned by a model constructor bound to one ORM handle. */
export type BoundModelInstance<
	C extends AnyModelConstructor,
	S extends ModelSchema,
	O extends UnboundOrm,
> =
	InstanceType<C> extends { readonly [MODEL_BASE_INSTANCE]: true }
		? InstanceType<C> & ModelBase<S, O>
		: InstanceType<C>;

/** A model constructor whose statics are bound to a particular ORM handle. */
export type BoundModelConstructor<
	C extends AnyModelConstructor,
	S extends ModelSchema,
	O extends UnboundOrm = UnboundOrm,
> = Omit<
	C,
	"select" | "create" | "insert" | "update" | "upsert" | "delete" | "hydrate"
> & {
	// biome-ignore lint/suspicious/noExplicitAny: retain a user's optional constructor arguments
	new (...args: any[]): BoundModelInstance<C, S, O>;
	prototype: BoundModelInstance<C, S, O>;
} & ModelStaticOperations<O, S> & {
		hydrate(record: HydrationInput<S["schema"]>): BoundModelInstance<C, S, O>;
	};

/** Per-instance ORM association. Stored in a WeakMap, never on the record. */
export type ModelRuntimeContext<O extends UnboundOrm = UnboundOrm> = {
	orm?: O;
	tb: string;
	invalid?: boolean;
	lifecycle?: ModelTransactionLifecycle;
};

/** Shared by every scoped handle on one transaction. */
export type ModelTransactionLifecycle = {
	parent: UnboundOrm;
	state: "active" | "committed" | "invalid";
	cancelAttempted: boolean;
	contexts: Set<ModelRuntimeContext>;
};

/** Used by transaction handles to register contexts created through aliases. */
export const registerModelContext = Symbol("surqlize.register.model.context");

type ModelContextRegistrar = {
	[registerModelContext]?: (context: ModelRuntimeContext) => void;
};

const modelContexts = new WeakMap<object, ModelRuntimeContext>();

/** Attach a model instance to the exact ORM or transaction handle that parsed it. */
export function setModelContext(
	record: object,
	context: ModelRuntimeContext,
): void {
	const existing = modelContexts.get(record);
	if (existing) {
		if (
			existing.tb !== context.tb ||
			modelContextFor(record).orm !== context.orm
		) {
			throw new OrmError(
				"A model instance cannot be shared between different tables or ORM connections",
			);
		}
		return;
	}

	const registrar = context.orm as ModelContextRegistrar | undefined;
	registrar?.[registerModelContext]?.(context);
	modelContexts.set(record, context);
}

/** Copy a model's hidden ORM binding when a store creates a row overlay. */
export function copyModelContext(source: object, target: object): void {
	const context = modelContexts.get(source);
	if (context) setModelContext(target, { ...context });
}

/** Create the shared lifecycle used by transaction handles and their aliases. */
export function createModelTransactionLifecycle(
	parent: UnboundOrm,
): ModelTransactionLifecycle {
	return {
		parent,
		state: "active",
		cancelAttempted: false,
		contexts: new Set(),
	};
}

/** Rebind models from a committed transaction to its parent ORM. */
export function commitModelTransactionLifecycle(
	lifecycle: ModelTransactionLifecycle,
): void {
	if (lifecycle.state !== "active") return;
	lifecycle.state = "committed";
	for (const context of lifecycle.contexts) {
		context.orm = lifecycle.parent;
		context.lifecycle = undefined;
	}
	lifecycle.contexts.clear();
}

/** Invalidate models that escaped a cancelled or uncertain transaction. */
export function invalidateModelTransactionLifecycle(
	lifecycle: ModelTransactionLifecycle,
): void {
	if (lifecycle.state !== "active") return;
	lifecycle.state = "invalid";
	for (const context of lifecycle.contexts) {
		context.orm = undefined;
		context.invalid = true;
		context.lifecycle = undefined;
	}
	lifecycle.contexts.clear();
}

function modelContextFor<O extends UnboundOrm = UnboundOrm>(
	record: object,
): ModelRuntimeContext<O> & { orm: O } {
	const context = modelContexts.get(record);
	if (!context) {
		throw new OrmError(
			"Model record is not bound to an ORM; only hydrated records can use $orm, select(), update(), or delete()",
		);
	}
	if (context.invalid || !context.orm) {
		throw new OrmError(
			"Model record came from a completed or cancelled transaction and cannot use model helpers",
		);
	}
	return context as ModelRuntimeContext<O> & { orm: O };
}

function modelId(record: object, tb: string): RecordId {
	const id = (record as { id?: unknown }).id;
	if (!(id instanceof RecordId) || String(id.table) !== tb) {
		throw new OrmError("Model record has no valid record ID for its table");
	}
	return id;
}

function unboundModelError(): never {
	throw new OrmError(
		"Model class is not bound to an ORM; use db.model(tableName) for static queries",
	);
}

/** Create the typed base class returned by `table.model()`. */
export function createModelClass<S extends ModelSchema>() {
	class TableModel extends ModelBase<S> {
		static hydrate(record: HydrationInput<S["schema"]>) {
			// biome-ignore lint/complexity/noThisInStatic: subclasses inherit this factory and need their own constructor.
			return Object.assign(new this(), record);
		}

		static get $orm(): never {
			return unboundModelError();
		}

		static select(): never {
			return unboundModelError();
		}

		static create(): never {
			return unboundModelError();
		}

		static insert(): never {
			return unboundModelError();
		}

		static update(): never {
			return unboundModelError();
		}

		static upsert(): never {
			return unboundModelError();
		}

		static delete(): never {
			return unboundModelError();
		}
	}
	return TableModel as unknown as ModelBaseConstructor<S>;
}

/** True for classes that inherit the model instance helpers. */
export function usesModelBase(model: ModelClass): boolean {
	return model.prototype instanceof ModelBase;
}

/**
 * Bind already-parsed model instances by following their schema nodes. This
 * never hydrates or reconstructs records; it only adds WeakMap context.
 */
export function bindModelContexts(
	value: unknown,
	type: AbstractType,
	orm: UnboundOrm,
): void {
	const visited = new WeakMap<object, Set<AbstractType>>();
	visitModelValue(value, type, orm, visited);
}

function visitModelValue(
	value: unknown,
	type: AbstractType,
	orm: UnboundOrm,
	visited: WeakMap<object, Set<AbstractType>>,
): void {
	if (value === undefined || value === null) return;
	if (type instanceof OptionTypeClass) {
		visitModelValue(value, type.schema, orm, visited);
		return;
	}
	if (type instanceof UnionTypeClass) {
		visitUnionValue(value, type, orm, visited);
		return;
	}
	if (type instanceof ArrayTypeClass) {
		visitArrayValue(value, type, orm, visited);
		return;
	}
	if (type instanceof SetTypeClass) {
		visitSetValue(value, type, orm, visited);
		return;
	}
	if (type instanceof ObjectTypeClass && typeof value === "object") {
		visitObjectValue(value, type, orm, visited);
	}
}

function visitUnionValue(
	value: unknown,
	type: UnionType<AbstractType[]>,
	orm: UnboundOrm,
	visited: WeakMap<object, Set<AbstractType>>,
): void {
	const member = (type.schema as AbstractType[]).find((candidate) =>
		candidate.validate(value),
	);
	if (member) visitModelValue(value, member, orm, visited);
}

function visitArrayValue(
	value: unknown,
	type: ArrayType,
	orm: UnboundOrm,
	visited: WeakMap<object, Set<AbstractType>>,
): void {
	if (!Array.isArray(value)) return;
	if (Array.isArray(type.schema)) {
		for (let index = 0; index < type.schema.length; index++) {
			visitModelValue(value[index], type.schema[index]!, orm, visited);
		}
		return;
	}
	for (const item of value) visitModelValue(item, type.schema, orm, visited);
}

function visitSetValue(
	value: unknown,
	type: SetType,
	orm: UnboundOrm,
	visited: WeakMap<object, Set<AbstractType>>,
): void {
	if (!(value instanceof Set)) return;
	for (const item of value) visitModelValue(item, type.schema, orm, visited);
}

function visitObjectValue(
	value: object,
	type: ObjectType,
	orm: UnboundOrm,
	visited: WeakMap<object, Set<AbstractType>>,
): void {
	let types = visited.get(value);
	if (types?.has(type)) return;
	if (!types) {
		types = new Set();
		visited.set(value, types);
	}
	types.add(type);

	const metadata = (
		type as typeof type & {
			[MODEL_SCHEMA]?: ModelSchemaMetadata;
		}
	)[MODEL_SCHEMA];
	if (metadata) setModelContext(value, { orm, tb: metadata.tb });
	for (const [key, fieldType] of Object.entries(type.schema) as [
		string,
		AbstractType,
	][]) {
		visitModelValue(
			(value as Record<string, unknown>)[key],
			fieldType,
			orm,
			visited,
		);
	}
}

/** Throw if a schemaless row would shadow a model helper on the instance. */
export function assertNoModelHelperFields(
	value: Record<string, unknown>,
	tb: string,
): void {
	for (const key of ["$orm", "select", "update", "delete"] as const) {
		if (Object.hasOwn(value, key)) {
			throw new OrmError(
				`Cannot hydrate model for table "${tb}": row field "${key}" is reserved for model helpers`,
			);
		}
	}
}

/** Hydrate a complete or optimistic row using the attached model's contract. */
export function hydrateModelRow(
	model: ModelClass,
	tb: string,
	usesBase: boolean,
	value: unknown,
): object {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new OrmError(
			`Cannot hydrate model for table "${tb}": expected a row object`,
		);
	}
	const row = value as Record<string, unknown>;
	if (usesBase) assertNoModelHelperFields(row, tb);

	const hydrate = (
		model as ModelClass & { hydrate?: (value: unknown) => unknown }
	).hydrate;
	if (typeof hydrate === "function") {
		const instance = Reflect.apply(hydrate, model, [row]);
		if (
			typeof instance !== "object" ||
			instance === null ||
			!(instance instanceof model)
		) {
			throw new OrmError(
				`The hydrate() method for table "${tb}" must return an instance of its attached model class`,
			);
		}
		if (usesBase) {
			assertNoModelHelperFields(instance as Record<string, unknown>, tb);
		}
		return instance;
	}
	return Object.assign(Object.create(model.prototype), row);
}

/** Create a per-ORM subclass with the existing model statics bound to `orm`. */
export function bindModelClass<
	C extends AnyModelConstructor,
	S extends ModelSchema,
	O extends UnboundOrm,
>(model: C, orm: O, tb: ModelTableName<O, S>): BoundModelConstructor<C, S, O> {
	class BoundModel extends model {
		static get $orm(): O {
			return orm;
		}

		static hydrate(record: HydrationInput<S["schema"]>) {
			const hydrate = model.hydrate;
			const instance = (
				typeof hydrate === "function"
					? Reflect.apply(hydrate, BoundModel, [record])
					: Object.assign(Object.create(model.prototype), record)
			) as object;
			setModelContext(instance, { orm, tb });
			return instance;
		}

		static select() {
			return orm.select(tb);
		}

		static create() {
			return orm.create(tb);
		}

		static insert(data?: unknown | unknown[]) {
			return data === undefined ? orm.insert(tb) : orm.insert(tb, data);
		}

		static update() {
			return orm.update(tb);
		}

		static upsert() {
			return orm.upsert(tb);
		}

		static delete() {
			return orm.delete(tb);
		}
	}

	for (const name of Object.getOwnPropertyNames(model)) {
		if (
			name === "length" ||
			name === "name" ||
			name === "prototype" ||
			name === "hydrate" ||
			name === "select" ||
			name === "create" ||
			name === "insert" ||
			name === "update" ||
			name === "upsert" ||
			name === "delete"
		)
			continue;

		const descriptor = Object.getOwnPropertyDescriptor(model, name);
		if (typeof descriptor?.value !== "function") continue;

		const staticMethod = descriptor.value as (...args: unknown[]) => unknown;
		Object.defineProperty(BoundModel, name, {
			...descriptor,
			value: (...args: unknown[]) => {
				const result = Reflect.apply(staticMethod, BoundModel, args);
				if (result instanceof model && !modelContexts.has(result)) {
					setModelContext(result, { orm, tb });
				}
				return result;
			},
		});
	}

	registerModelClass(BoundModel);
	return BoundModel as unknown as BoundModelConstructor<C, S, O>;
}
