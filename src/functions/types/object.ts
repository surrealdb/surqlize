import { t, type ObjectTypeInner, type ObjectType } from "../../types";
import { __ctx, __type, __display, type Workable, type WorkableContext } from "../../utils";
import { actionable, type Actionable } from "../../utils/actionable";

export const functions = {
    extend<
        C extends WorkableContext,
        T extends ObjectTypeInner,
        R extends ObjectTypeInner,
    >(
        this: Workable<C, ObjectType<T>>,
        cb: (arg: Actionable<C, ObjectType<T>>) => Workable<C, ObjectType<R>>,
    ): Actionable<C, ObjectType<T & R>> {
        const inner = actionable(this);
        const res = cb(inner);
        const merged = { ...this[__type].schema, ...res[__type].schema };

        return actionable({
            [__ctx]: this[__ctx],
            [__type]: t.object(merged),
            [__display](ctx) {
                return `(${this[__display](ctx)}, ${res[__display](ctx)})`;
            },
        });
    },
} satisfies Functions;

export type Functions = {
    extend<
        C extends WorkableContext,
        T extends ObjectTypeInner,
        R extends ObjectTypeInner,
    >(
        this: Workable<C, ObjectType<T>>,
        cb: (arg: Actionable<C, ObjectType<T>>) => Workable<C, ObjectType<R>>,
    ): Actionable<C, ObjectType<T & R>>;
}