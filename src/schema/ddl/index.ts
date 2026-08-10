// Generating SurrealQL definitions from a schema.

export type { DefinableSchema, DefineOptions } from "./define";
export { defineField, defineSchema, defineTable } from "./define";
export type {
	AccessDuration,
	AccessOptions,
	AnalyzerOptions,
	ApiConfigOptions,
	BearerAccessOptions,
	DatabaseEntity,
	EntityKind,
	FunctionOptions,
	GraphqlConfigOptions,
	GraphqlExposure,
	JwtAccessOptions,
	JwtAlgorithm,
	ParamOptions,
	RecordAccessOptions,
	SequenceOptions,
} from "./entities";
export {
	access,
	analyzer,
	config,
	param,
	sequence,
	storedFunction,
} from "./entities";
export type { EventDefinition, EventOptions, EventTrigger } from "./event-ddl";
export { defineEvent } from "./event-ddl";
export type { FlatField } from "./flatten";
export { flattenFields } from "./flatten";
export type {
	DistanceMetric,
	FulltextOptions,
	HnswOptions,
	IndexDefinition,
	IndexOptions,
	VectorType,
} from "./index-ddl";
export { defineIndex } from "./index-ddl";
export { printSurqlType } from "./print-type";
export type {
	HasTableDdl,
	TableChangefeed,
	TableDdl,
	TablePermissionRules,
	TablePermissions,
} from "./table-ddl";
