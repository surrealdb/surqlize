# Idiom: Dynamic Calls and Name Collisions

Source coverage: `idiom/fallback_function.surql`, `idiom/function_argument_computation.surql`, object method collision tests.

```surql
LET $obj = { fnc: || 1, keys: || 2 };
$obj.fnc();
($obj.fnc)();
$obj.keys();
($obj.keys)();
RETURN [1, 2, 3, 4][fn::foo()];
```

```ts
const obj = q.param("obj");

obj.callField("fnc");
obj.field("fnc").call();

obj.callField("keys");
obj.field("keys").call();

q.array([1, 2, 3, 4]).index(fn.custom("foo")());
```

API implications:

- A property named `keys` can be data or a function; direct `.keys()` is ambiguous.
- Use `.field("keys")` for data access and `.fn.keys()` for builtin object function calls.
- Dynamic call support should be explicit: `call()`, `callField(name)`, and `fn.custom("pkg::name")`.

