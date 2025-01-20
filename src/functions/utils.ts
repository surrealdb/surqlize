import type { AbstractType } from "../types";
import { __ctx, __type, __display, type Workable, type WorkableContext } from "../utils";
import { actionable, type Actionable } from "../utils/actionable";

export function databaseFunction<C extends WorkableContext, T extends AbstractType>(
    ctx: C,
    type: T,
    fn: string,
    ...params: Workable<C>[]
): Actionable<C, T> {
    return actionable({
        [__ctx]: ctx,
        [__type]: type,
        [__display](ctx) {
            const vars = params.map((p) => p[__display](ctx)).join(", ");
            return `${fn}(${vars})`;
        },
    });
}