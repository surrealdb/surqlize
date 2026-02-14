import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { standaloneFn } from "./index";

export const type_ = {
	// Casting functions

	array<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.array(t.string()), "type::array", value);
	},
	bool<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::bool", value);
	},
	datetime<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.date(), "type::datetime", value);
	},
	float<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.number(), "type::float", value);
	},
	int<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.number(), "type::int", value);
	},
	number<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.number(), "type::number", value);
	},
	string<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "type::string", value);
	},
	of<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "type::of", value);
	},
	table<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "type::table", value);
	},
	uuid<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "type::uuid", value);
	},

	// Type check functions

	isArray<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_array", value);
	},
	isBool<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_bool", value);
	},
	isBytes<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_bytes", value);
	},
	isCollection<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_collection", value);
	},
	isDatetime<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_datetime", value);
	},
	isDecimal<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_decimal", value);
	},
	isDuration<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_duration", value);
	},
	isFloat<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_float", value);
	},
	isGeometry<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_geometry", value);
	},
	isInt<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_int", value);
	},
	isLine<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_line", value);
	},
	isNone<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_none", value);
	},
	isNull<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_null", value);
	},
	isMultiline<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_multiline", value);
	},
	isMultipoint<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_multipoint", value);
	},
	isMultipolygon<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_multipolygon", value);
	},
	isNumber<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_number", value);
	},
	isObject<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_object", value);
	},
	isPoint<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_point", value);
	},
	isPolygon<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_polygon", value);
	},
	isRange<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_range", value);
	},
	isRecord<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_record", value);
	},
	isString<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_string", value);
	},
	isUuid<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.bool(), "type::is_uuid", value);
	},
};
