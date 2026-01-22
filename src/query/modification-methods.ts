import type { ObjectType } from "../types";
import type { DisplayContext } from "../utils/display.ts";
import {
	type SetValue,
	generateSetAssignments,
	processSetOperators,
} from "./utils.ts";

// Shared types
export type SetData<T extends ObjectType> = {
	[K in keyof T["schema"]]?: SetValue<T["schema"][K]>;
};

export type JsonPatchOp =
	| { op: "add"; path: string; value: unknown }
	| { op: "remove"; path: string }
	| { op: "replace"; path: string; value: unknown }
	| { op: "move"; from: string; path: string }
	| { op: "copy"; from: string; path: string }
	| { op: "test"; path: string; value: unknown };

export type ModificationMode =
	| "set"
	| "content"
	| "merge"
	| "patch"
	| "replace";

// Shared state interface
export interface ModificationState {
	_set?: Record<string, unknown>;
	_unset?: string[];
	_content?: unknown;
	_merge?: unknown;
	_patch?: JsonPatchOp[];
	_replace?: unknown;
	_modificationMode?: ModificationMode;
}

// Helper function to check modification mode exclusivity
export function checkModificationMode(
	currentMode: ModificationMode | undefined,
	newMode: ModificationMode,
): void {
	if (currentMode && currentMode !== newMode) {
		throw new Error(
			`Cannot use ${newMode}() when ${currentMode}() has already been used`,
		);
	}
}

// Helper functions for setting modification data
export function applySet(
	state: ModificationState,
	data: Record<string, unknown>,
): void {
	checkModificationMode(state._modificationMode, "set");
	state._modificationMode = "set";
	const processedData = processSetOperators(data);
	state._set = { ...state._set, ...processedData };
}

export function applyUnset(state: ModificationState, fields: string[]): void {
	checkModificationMode(state._modificationMode, "set");
	state._modificationMode = "set";
	state._unset = [...(state._unset || []), ...fields];
}

export function applyContent(state: ModificationState, data: unknown): void {
	checkModificationMode(state._modificationMode, "content");
	state._modificationMode = "content";
	state._content = data;
}

export function applyMerge(state: ModificationState, data: unknown): void {
	checkModificationMode(state._modificationMode, "merge");
	state._modificationMode = "merge";
	state._merge = data;
}

export function applyPatch(
	state: ModificationState,
	operations: JsonPatchOp[],
): void {
	checkModificationMode(state._modificationMode, "patch");
	state._modificationMode = "patch";
	state._patch = operations;
}

export function applyReplace(state: ModificationState, data: unknown): void {
	checkModificationMode(state._modificationMode, "replace");
	state._modificationMode = "replace";
	state._replace = data;
}

// Helper function to generate modification clause SQL
export function displayModificationClause(
	state: ModificationState,
	ctx: DisplayContext,
): string {
	if (state._content) {
		return /* surql */ ` CONTENT ${ctx.var(state._content)}`;
	}
	if (state._merge) {
		return /* surql */ ` MERGE ${ctx.var(state._merge)}`;
	}
	if (state._patch) {
		return /* surql */ ` PATCH ${ctx.var(state._patch)}`;
	}
	if (state._replace) {
		return /* surql */ ` REPLACE ${ctx.var(state._replace)}`;
	}
	if (state._set || state._unset) {
		const parts: string[] = [];

		if (state._set) {
			const assignments = generateSetAssignments(state._set, ctx);
			if (assignments.length > 0) {
				parts.push(`SET ${assignments.join(", ")}`);
			}
		}

		if (state._unset && state._unset.length > 0) {
			parts.push(`UNSET ${state._unset.join(", ")}`);
		}

		if (parts.length > 0) {
			return ` ${parts.join(" ")}`;
		}
	}

	return "";
}
