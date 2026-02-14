import {
	type ArrayType,
	type BoolType,
	type NumberType,
	type StringType,
	t,
} from "../../types";
import {
	type IntoWorkable,
	type Workable,
	type WorkableContext,
	__ctx,
	intoWorkable,
} from "../../utils";
import type { Actionable } from "../../utils/actionable";
import { databaseFunction } from "../utils";

export const functions = {
	startsWith<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), v);
		return databaseFunction(
			this[__ctx],
			t.bool(),
			"string::starts_with",
			this,
			val,
		);
	},
	endsWith<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), v);
		return databaseFunction(
			this[__ctx],
			t.bool(),
			"string::ends_with",
			this,
			val,
		);
	},
	len<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.number(), "string::len", this);
	},
	join<C extends WorkableContext>(
		this: Workable<C, StringType>,
		separator: IntoWorkable<C, StringType>,
		...others: [IntoWorkable<C, StringType>, ...IntoWorkable<C, StringType>[]]
	) {
		const sep = intoWorkable(this[__ctx], t.string(), separator);
		const workables = others.map((p) =>
			intoWorkable(this[__ctx], t.string(), p),
		);
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::join",
			sep,
			this,
			...workables,
		);
	},

	// Core string functions

	capitalize<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::capitalize",
			this,
		);
	},
	concat<C extends WorkableContext>(
		this: Workable<C, StringType>,
		...values: IntoWorkable<C, StringType>[]
	) {
		const workables = values.map((v) =>
			intoWorkable(this[__ctx], t.string(), v),
		);
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::concat",
			this,
			...workables,
		);
	},
	contains<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), v);
		return databaseFunction(
			this[__ctx],
			t.bool(),
			"string::contains",
			this,
			val,
		);
	},
	lowercase<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.string(), "string::lowercase", this);
	},
	uppercase<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.string(), "string::uppercase", this);
	},
	trim<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.string(), "string::trim", this);
	},
	repeat<C extends WorkableContext>(
		this: Workable<C, StringType>,
		n: IntoWorkable<C, NumberType>,
	) {
		const val = intoWorkable(this[__ctx], t.number(), n);
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::repeat",
			this,
			val,
		);
	},
	replace<C extends WorkableContext>(
		this: Workable<C, StringType>,
		from: IntoWorkable<C, StringType>,
		to: IntoWorkable<C, StringType>,
	) {
		const f = intoWorkable(this[__ctx], t.string(), from);
		const toVal = intoWorkable(this[__ctx], t.string(), to);
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::replace",
			this,
			f,
			toVal,
		);
	},
	reverse<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.string(), "string::reverse", this);
	},
	slice<C extends WorkableContext>(
		this: Workable<C, StringType>,
		start: IntoWorkable<C, NumberType>,
		length: IntoWorkable<C, NumberType>,
	) {
		const s = intoWorkable(this[__ctx], t.number(), start);
		const l = intoWorkable(this[__ctx], t.number(), length);
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::slice",
			this,
			s,
			l,
		);
	},
	slug<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.string(), "string::slug", this);
	},
	split<C extends WorkableContext>(
		this: Workable<C, StringType>,
		delimiter: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), delimiter);
		return databaseFunction(
			this[__ctx],
			t.array(t.string()),
			"string::split",
			this,
			val,
		);
	},
	words<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(
			this[__ctx],
			t.array(t.string()),
			"string::words",
			this,
		);
	},
	matches<C extends WorkableContext>(
		this: Workable<C, StringType>,
		pattern: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), pattern);
		return databaseFunction(
			this[__ctx],
			t.bool(),
			"string::matches",
			this,
			val,
		);
	},

	// Distance functions

	distanceDamerauLevenshtein<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), other);
		return databaseFunction(
			this[__ctx],
			t.number(),
			"string::distance::damerau_levenshtein",
			this,
			val,
		);
	},
	distanceNormalizedDamerauLevenshtein<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), other);
		return databaseFunction(
			this[__ctx],
			t.number(),
			"string::distance::normalized_damerau_levenshtein",
			this,
			val,
		);
	},
	distanceHamming<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), other);
		return databaseFunction(
			this[__ctx],
			t.number(),
			"string::distance::hamming",
			this,
			val,
		);
	},
	distanceLevenshtein<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), other);
		return databaseFunction(
			this[__ctx],
			t.number(),
			"string::distance::levenshtein",
			this,
			val,
		);
	},
	distanceNormalizedLevenshtein<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), other);
		return databaseFunction(
			this[__ctx],
			t.number(),
			"string::distance::normalized_levenshtein",
			this,
			val,
		);
	},
	distanceOsa<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), other);
		return databaseFunction(
			this[__ctx],
			t.number(),
			"string::distance::osa",
			this,
			val,
		);
	},

	// HTML functions

	htmlEncode<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::html::encode",
			this,
		);
	},
	htmlSanitize<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::html::sanitize",
			this,
		);
	},

	// Validation functions (is_*)

	isAlphanum<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_alphanum", this);
	},
	isAlpha<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_alpha", this);
	},
	isAscii<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_ascii", this);
	},
	isDatetime<C extends WorkableContext>(
		this: Workable<C, StringType>,
		format: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), format);
		return databaseFunction(
			this[__ctx],
			t.bool(),
			"string::is_datetime",
			this,
			val,
		);
	},
	isDomain<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_domain", this);
	},
	isEmail<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_email", this);
	},
	isHexadecimal<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(
			this[__ctx],
			t.bool(),
			"string::is_hexadecimal",
			this,
		);
	},
	isIp<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_ip", this);
	},
	isIpv4<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_ipv4", this);
	},
	isIpv6<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_ipv6", this);
	},
	isLatitude<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_latitude", this);
	},
	isLongitude<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(
			this[__ctx],
			t.bool(),
			"string::is_longitude",
			this,
		);
	},
	isNumeric<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_numeric", this);
	},
	isRecord<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_record", this);
	},
	isSemver<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_semver", this);
	},
	isUlid<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_ulid", this);
	},
	isUrl<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_url", this);
	},
	isUuid<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(this[__ctx], t.bool(), "string::is_uuid", this);
	},

	// Semver functions

	semverCompare<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), other);
		return databaseFunction(
			this[__ctx],
			t.number(),
			"string::semver::compare",
			this,
			val,
		);
	},
	semverMajor<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(
			this[__ctx],
			t.number(),
			"string::semver::major",
			this,
		);
	},
	semverMinor<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(
			this[__ctx],
			t.number(),
			"string::semver::minor",
			this,
		);
	},
	semverPatch<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(
			this[__ctx],
			t.number(),
			"string::semver::patch",
			this,
		);
	},
	semverIncMajor<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::semver::inc::major",
			this,
		);
	},
	semverIncMinor<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::semver::inc::minor",
			this,
		);
	},
	semverIncPatch<C extends WorkableContext>(this: Workable<C, StringType>) {
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::semver::inc::patch",
			this,
		);
	},
	semverSetMajor<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, NumberType>,
	) {
		const val = intoWorkable(this[__ctx], t.number(), v);
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::semver::set::major",
			this,
			val,
		);
	},
	semverSetMinor<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, NumberType>,
	) {
		const val = intoWorkable(this[__ctx], t.number(), v);
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::semver::set::minor",
			this,
			val,
		);
	},
	semverSetPatch<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, NumberType>,
	) {
		const val = intoWorkable(this[__ctx], t.number(), v);
		return databaseFunction(
			this[__ctx],
			t.string(),
			"string::semver::set::patch",
			this,
			val,
		);
	},

	// Similarity functions

	similarityFuzzy<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), other);
		return databaseFunction(
			this[__ctx],
			t.number(),
			"string::similarity::fuzzy",
			this,
			val,
		);
	},
	similarityJaro<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), other);
		return databaseFunction(
			this[__ctx],
			t.number(),
			"string::similarity::jaro",
			this,
			val,
		);
	},
	similarityJaroWinkler<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	) {
		const val = intoWorkable(this[__ctx], t.string(), other);
		return databaseFunction(
			this[__ctx],
			t.number(),
			"string::similarity::jaro_winkler",
			this,
			val,
		);
	},
} satisfies Functions;

export type Functions = {
	startsWith<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, StringType>,
	): Actionable<C, BoolType>;
	endsWith<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, StringType>,
	): Actionable<C, BoolType>;
	len<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, NumberType>;
	join<C extends WorkableContext>(
		this: Workable<C, StringType>,
		separator: IntoWorkable<C, StringType>,
		...others: [IntoWorkable<C, StringType>, ...IntoWorkable<C, StringType>[]]
	): Actionable<C, StringType>;

	// Core string functions

	capitalize<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, StringType>;
	concat<C extends WorkableContext>(
		this: Workable<C, StringType>,
		...values: IntoWorkable<C, StringType>[]
	): Actionable<C, StringType>;
	contains<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, StringType>,
	): Actionable<C, BoolType>;
	lowercase<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, StringType>;
	uppercase<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, StringType>;
	trim<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, StringType>;
	repeat<C extends WorkableContext>(
		this: Workable<C, StringType>,
		n: IntoWorkable<C, NumberType>,
	): Actionable<C, StringType>;
	replace<C extends WorkableContext>(
		this: Workable<C, StringType>,
		from: IntoWorkable<C, StringType>,
		to: IntoWorkable<C, StringType>,
	): Actionable<C, StringType>;
	reverse<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, StringType>;
	slice<C extends WorkableContext>(
		this: Workable<C, StringType>,
		start: IntoWorkable<C, NumberType>,
		length: IntoWorkable<C, NumberType>,
	): Actionable<C, StringType>;
	slug<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, StringType>;
	split<C extends WorkableContext>(
		this: Workable<C, StringType>,
		delimiter: IntoWorkable<C, StringType>,
	): Actionable<C, ArrayType<StringType>>;
	words<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, ArrayType<StringType>>;
	matches<C extends WorkableContext>(
		this: Workable<C, StringType>,
		pattern: IntoWorkable<C, StringType>,
	): Actionable<C, BoolType>;

	// Distance functions

	distanceDamerauLevenshtein<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	): Actionable<C, NumberType>;
	distanceNormalizedDamerauLevenshtein<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	): Actionable<C, NumberType>;
	distanceHamming<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	): Actionable<C, NumberType>;
	distanceLevenshtein<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	): Actionable<C, NumberType>;
	distanceNormalizedLevenshtein<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	): Actionable<C, NumberType>;
	distanceOsa<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	): Actionable<C, NumberType>;

	// HTML functions

	htmlEncode<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, StringType>;
	htmlSanitize<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, StringType>;

	// Validation functions (is_*)

	isAlphanum<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isAlpha<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isAscii<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isDatetime<C extends WorkableContext>(
		this: Workable<C, StringType>,
		format: IntoWorkable<C, StringType>,
	): Actionable<C, BoolType>;
	isDomain<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isEmail<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isHexadecimal<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isIp<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isIpv4<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isIpv6<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isLatitude<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isLongitude<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isNumeric<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isRecord<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isSemver<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isUlid<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isUrl<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;
	isUuid<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, BoolType>;

	// Semver functions

	semverCompare<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	): Actionable<C, NumberType>;
	semverMajor<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, NumberType>;
	semverMinor<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, NumberType>;
	semverPatch<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, NumberType>;
	semverIncMajor<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, StringType>;
	semverIncMinor<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, StringType>;
	semverIncPatch<C extends WorkableContext>(
		this: Workable<C, StringType>,
	): Actionable<C, StringType>;
	semverSetMajor<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, NumberType>,
	): Actionable<C, StringType>;
	semverSetMinor<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, NumberType>,
	): Actionable<C, StringType>;
	semverSetPatch<C extends WorkableContext>(
		this: Workable<C, StringType>,
		v: IntoWorkable<C, NumberType>,
	): Actionable<C, StringType>;

	// Similarity functions

	similarityFuzzy<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	): Actionable<C, NumberType>;
	similarityJaro<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	): Actionable<C, NumberType>;
	similarityJaroWinkler<C extends WorkableContext>(
		this: Workable<C, StringType>,
		other: IntoWorkable<C, StringType>,
	): Actionable<C, NumberType>;
};
