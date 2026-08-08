import type { DefinableSchema } from "../ddl/define";
import type { DiagramField, DiagramModel, DiagramTable } from "./model";
import { isStructuralField, toDiagramModel } from "./model";

/** How much detail a diagram carries. */
export type DiagramLevel = "minimal" | "detailed";

/** How to draw the diagram. */
export interface MermaidOptions {
	/**
	 * `minimal` shows names and types; `detailed` adds defaults, constraints and
	 * comments. Defaults to `minimal`.
	 */
	level?: DiagramLevel;
	/** Include field comments in `detailed` output. Defaults to true. */
	includeComments?: boolean;
}

/**
 * Draw a Mermaid ER diagram of a schema.
 *
 * Pure string generation with no dependencies, so it runs anywhere — a build
 * step, a docs page, or an app showing users its own shape.
 *
 * @param definitions - The tables and edges to draw
 * @param options - Level of detail
 * @returns Mermaid `erDiagram` source
 *
 * @example
 * ```ts
 * const diagram = mermaid([user, post, authored], { level: "detailed" });
 * ```
 */
export function mermaid(
	definitions: DefinableSchema[],
	options: MermaidOptions = {},
): string {
	const level = options.level ?? "minimal";
	const includeComments = options.includeComments ?? true;
	const model = toDiagramModel(definitions);

	const lines = ["erDiagram", ...relationshipLines(model)];

	if (model.tables.length > 0) {
		lines.push("");
		for (const table of model.tables) {
			lines.push(...tableLines(table, level, includeComments));
		}
	}

	return lines.join("\n");
}

/**
 * The arrows, drawn before the entities.
 *
 * Explicit edges come first, then links inferred from `record<…>` fields. Each
 * arrow is emitted once per (table, field, target), so two fields pointing at
 * the same table draw two arrows — which is the useful reading.
 */
function relationshipLines(model: DiagramModel): string[] {
	const drawn = new Set<string>();

	/** Emit an arrow unless the same (from, label, to) was already drawn. */
	const arrow = (from: string, glyph: string, to: string, label: string) => {
		const key = `${from}-${label}-${to}`;
		if (drawn.has(key)) return [];
		drawn.add(key);

		return [`    ${from} ${glyph} ${to} : "${label}"`];
	};

	const edges = model.relations.flatMap((relation) =>
		arrow(
			relation.from,
			relation.collection ? "||--o{" : "}o--||",
			relation.to,
			relation.name,
		),
	);

	const links = model.tables.flatMap((table) =>
		table.fields
			// `id`, `in` and `out` are SurrealDB's, and reading them as links would
			// draw a self-reference on every table.
			.filter((field) => !isStructuralField(field.name))
			.flatMap((field) =>
				linkTargets(field.type).flatMap((target) =>
					arrow(
						table.name,
						linkArrow(field, target === table.name),
						target,
						field.name,
					),
				),
			),
	);

	return [...edges, ...links];
}

/** The tables named by a `record<…>` type, if any. */
function linkTargets(type: string): string[] {
	const match = type.match(/record<([^>]+)>/);
	if (!match) return [];

	// A bare `record` names no table, so there is nothing to point at.
	return (match[1] as string).split("|").map((name) => name.trim());
}

/**
 * The arrow for an inferred link.
 *
 * A self-reference is always drawn one-to-many: it is a tree or a graph, and
 * the optional/array distinction says nothing useful about it.
 */
function linkArrow(field: DiagramField, selfReference: boolean): string {
	if (selfReference) return "||--o{";

	const collection = /\b(array|set)</.test(field.type);
	const optional =
		field.type.includes("option<") || field.type.includes("none |");

	// smig had both arms of this identical, so an optional array was
	// indistinguishable from a required one.
	if (collection) return optional ? "|o--o{" : "||--o{";
	return optional ? "}o--o|" : "}o--||";
}

/** One entity block. */
function tableLines(
	table: DiagramTable,
	level: DiagramLevel,
	includeComments: boolean,
): string[] {
	const lines = [`    ${table.name} {`];

	for (const field of table.fields) {
		const annotations =
			level === "minimal"
				? minimalAnnotations(field)
				: detailedAnnotations(field, includeComments);

		// Mermaid's attribute token accepts only word characters, so a dotted
		// path becomes underscored here. Relationship labels keep the dots.
		const name = field.name.replace(/\./g, "_");
		const type = simplifyType(field.type);

		lines.push(
			`        ${type} ${name}${annotations ? ` ${annotations}` : ""}`,
		);
	}

	lines.push("    }", "");
	return lines;
}

/**
 * Key markers and a short constraint, for `minimal`.
 *
 * `UK` and `PK` are emitted bare so Mermaid reads them as key markers. In
 * `detailed` they are swept into the quoted blob instead, where they read as
 * text — the two levels annotate differently on purpose.
 */
function minimalAnnotations(field: DiagramField): string {
	const parts = keyMarkers(field);

	if (field.assert) {
		const constraint = constraintSummary(field.assert);
		if (constraint) parts.push(`"${constraint}"`);
	}

	return parts.join(" ");
}

/** Everything worth saying about a field, as one quoted blob. */
function detailedAnnotations(
	field: DiagramField,
	includeComments: boolean,
): string {
	const parts = keyMarkers(field);

	if (field.default !== undefined && field.default !== null) {
		const formatted = formatDefault(field.default);
		if (formatted) parts.push(`default: ${formatted}`);
	}

	if (field.computed) parts.push("computed");
	else if (field.value) parts.push(`value: ${truncate(field.value, 30)}`);

	if (field.readonly) parts.push("readonly");

	if (field.assert) {
		const constraint = constraintSummary(field.assert);
		if (constraint) parts.push(constraint);
	}

	if (field.comment && includeComments) parts.push(truncate(field.comment, 40));

	return parts.length ? `"${parts.join("; ")}"` : "";
}

/** `UK` and `PK` markers, shared by both levels. */
function keyMarkers(field: DiagramField): string[] {
	const parts: string[] = [];

	// A unique index is authoritative; the assert and comment are fallbacks for
	// a schema that expresses uniqueness some other way.
	if (
		field.unique ||
		field.assert?.includes("UNIQUE") ||
		field.comment?.toLowerCase().includes("unique")
	) {
		parts.push("UK");
	}

	if (field.name === "id" || field.comment?.toLowerCase().includes("primary")) {
		parts.push("PK");
	}

	return parts;
}

/** Reduce a SurrealQL type to the word shown in an entity row. */
function simplifyType(type: string): string {
	const option = type.match(/^option<(.+)>$/);
	if (option) return simplifyType(option[1] as string);
	// SurrealDB stores optionality as a union with none
	const union = type.match(/^none \| (.+)$/);
	if (union) return simplifyType(union[1] as string);

	if (type.startsWith("array<")) return "array";
	if (type.startsWith("set<")) return "set";
	if (type.startsWith("record<") || type === "record") return "record";
	if (type.startsWith("geometry<")) return "geometry";

	// Widths and formats collapse to how they read, not how they are stored.
	const display: Record<string, string> = {
		float: "number",
		decimal: "number",
		uuid: "string",
		duration: "string",
	};

	return display[type] ?? type;
}

/** Render a default value for display. */
function formatDefault(value: unknown): string {
	if (typeof value === "string") {
		return value.length > 20 ? `'${value.slice(0, 17)}...'` : `'${value}'`;
	}
	if (typeof value === "boolean" || typeof value === "number")
		return String(value);
	if (Array.isArray(value)) return "[]";
	if (typeof value === "object") return "{}";
	return "";
}

/** Summarise an assert condition in a few words. */
function constraintSummary(assert: string): string {
	const constraints: string[] = [];

	const lengthRange = [
		assert.match(/string::len.*?>=\s*(\d+)/),
		assert.match(/string::len.*?<=\s*(\d+)/),
	];
	if (lengthRange[0] && lengthRange[1]) {
		constraints.push(`${lengthRange[0][1]}-${lengthRange[1][1]} chars`);
	} else if (lengthRange[0]) {
		constraints.push(`min ${lengthRange[0][1]} chars`);
	}

	const valueRange = [
		assert.match(/\$value\s*>=\s*(\d+)/),
		assert.match(/\$value\s*<=\s*(\d+)/),
	];
	if (valueRange[0] && valueRange[1]) {
		constraints.push(`${valueRange[0][1]}-${valueRange[1][1]}`);
	} else if (valueRange[0]) {
		constraints.push(`>=${valueRange[0][1]}`);
	}

	// Both the 2.x and 3.x spellings
	if (
		assert.includes("string::is_email") ||
		assert.includes("string::is::email")
	) {
		constraints.push("email");
	}

	if (
		(assert.includes("~") && assert.includes("/")) ||
		assert.includes("string::matches")
	) {
		constraints.push("pattern");
	}

	return constraints.join(", ");
}

/** Shorten a string, marking that it was shortened. */
function truncate(value: string, maxLength: number): string {
	return value.length <= maxLength
		? value
		: `${value.slice(0, maxLength - 3)}...`;
}
