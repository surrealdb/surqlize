import { GeometryPoint } from "surrealdb";
import {
	type AbstractType,
	ArrayType,
	NumberType,
	PointType,
	t,
} from "../../types";
import {
	__ctx,
	__type,
	intoWorkable,
	isWorkable,
	type Workable,
	type WorkableContext,
} from "../../utils";
import { standaloneFn } from "./internal";

type CoordinateType = ArrayType<[NumberType, NumberType]>;
type PointExpression<C extends WorkableContext> = Workable<
	C,
	PointType | CoordinateType
>;
type Coordinate = readonly [number, number];
type PointArgument<C extends WorkableContext> =
	| PointExpression<C>
	| GeometryPoint
	| Coordinate;
type DistanceArguments<C extends WorkableContext> =
	| [p1: PointExpression<C>, p2: PointArgument<C>]
	| [p1: GeometryPoint | Coordinate, p2: PointExpression<C>];

function isCoordinateType(type: AbstractType): type is CoordinateType {
	return (
		type instanceof ArrayType &&
		Array.isArray(type.schema) &&
		type.schema.length === 2 &&
		type.schema.every((item) => item instanceof NumberType)
	);
}

function normalizePoint<C extends WorkableContext>(
	source: PointExpression<C>,
	value: PointArgument<C>,
): Workable<C, PointType> {
	if (isWorkable(value)) {
		if (value[__type] instanceof PointType)
			return value as Workable<C, PointType>;
		if (isCoordinateType(value[__type]))
			return standaloneFn(value, t.point(), "type::point", value);
	}

	if (value instanceof GeometryPoint)
		return intoWorkable(source[__ctx], t.point(), value);

	const coordinates = intoWorkable(
		source[__ctx],
		t.array([t.number(), t.number()]),
		value as [number, number],
	);
	return standaloneFn(source, t.point(), "type::point", coordinates);
}

export const geo = {
	area<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.number(), "geo::area", value);
	},
	bearing<C extends WorkableContext>(p1: Workable<C>, p2: Workable<C>) {
		return standaloneFn(p1, t.number(), "geo::bearing", p1, p2);
	},
	centroid<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "geo::centroid", value);
	},
	// Point normalization is intentionally limited to distance; the other geo
	// functions retain their existing generic signatures until their point types
	// are specified.
	distance<C extends WorkableContext>(...args: DistanceArguments<C>) {
		const [p1, p2] = args;
		const source = (isWorkable(p1) ? p1 : p2) as PointExpression<C>;
		const point1 = normalizePoint(source, p1);
		const point2 = normalizePoint(source, p2);
		return standaloneFn(point1, t.number(), "geo::distance", point1, point2);
	},
	hashDecode<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "geo::hash::decode", value);
	},
	hashEncode<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "geo::hash::encode", value);
	},
	hashEncodeAccuracy<C extends WorkableContext>(
		value: Workable<C>,
		accuracy: Workable<C>,
	) {
		return standaloneFn(
			value,
			t.string(),
			"geo::hash::encode",
			value,
			accuracy,
		);
	},
};
