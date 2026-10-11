// Generating SurrealQL definitions from a schema.

export type {
	DefinableSchema,
	DefineOptions,
	SchemaStatement,
	StatementKind,
} from "./define";
export {
	defineField,
	defineSchema,
	defineTable,
	schemaStatements,
} from "./define";
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
	GeneratedSchema,
	SchemaOptions,
	SkippedDefinition,
} from "./generate";
export { generateSchema, toSurql } from "./generate";
export type {
	DistanceMetric,
	FulltextOptions,
	HnswOptions,
	IndexDefinition,
	IndexOptions,
	VectorType,
} from "./index-ddl";
export { defineIndex } from "./index-ddl";
export type {
	FieldOperation,
	FieldPermissionRules,
	FieldPermissions,
	LooseAuthType,
	LooseRow,
	PermissionContext,
	PermissionRule,
	SessionType,
	TableOperation,
	TablePermissionRules,
	TablePermissions,
	TokenType,
} from "./permissions";
export { authenticatedAs, WhereRule, where } from "./permissions";
export { printSurqlType } from "./print-type";
export type { HasTableDdl, TableChangefeed, TableDdl } from "./table-ddl";
