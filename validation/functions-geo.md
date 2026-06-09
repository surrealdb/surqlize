# Functions: geo

Coverage list: `area`, `bearing`, `centroid`, `distance`, `hash::decode`, `hash::encode`, `is_valid`.

```surql
RETURN geo::distance((0, 0), (1, 1));
RETURN geo::bearing((0, 0), (1, 1));
RETURN geo::area({ type: "Polygon", coordinates: [[[0,0],[1,0],[1,1],[0,0]]] });
RETURN geo::hash::encode((52.1, 5.1));
RETURN geo::hash::decode("u173z");
RETURN geo::is_valid((0, 0));
```

```ts
fn.geo.distance(q.point(0, 0), q.point(1, 1));
fn.geo.bearing(q.point(0, 0), q.point(1, 1));
fn.geo.area(q.geometry.polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]]));
fn.geo.hash.encode(q.point(52.1, 5.1));
fn.geo.hash.decode("u173z");
fn.geo.isValid(q.point(0, 0));
```

Type-safety target:

- Geometry literals should be typed constructors, not arbitrary objects only.
- `geo::hash::*` lives under a nested namespace.

