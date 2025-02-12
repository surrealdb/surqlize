import type { Prettify } from "surrealdb";
import { __ctx, __display, __type, type DisplayContext, type Workable, type WorkableContext } from "../utils"
import { actionable, type Actionable } from "../utils/actionable"

export type Walkable<C extends WorkableContext, Tb extends keyof C['orm']['tables']> = Actionable<C, C['orm']["tables"][Tb]["schema"]>;
export type Walkables<
    C extends WorkableContext, 
    Tb extends keyof C['orm']['tables'],
    T extends `$${string}`,
    R extends Workable<C> = Workable<C>,
> = (vars: Prettify<{
    [K in T]: Walkable<C, Tb>;
}>) => R;

export function createWalkable<
    C extends WorkableContext,
    Tb extends keyof C['orm']['tables']
>(
    ctx: C, 
    tb: Tb,
    display: `$${string}` | ((ctx: DisplayContext) => string)
): Walkable<C, Tb> {
    return actionable({
        [__ctx]: ctx,
        [__display](ctx) {
            if (typeof display === "string") {
                return display;
            }

            return display(ctx);
        },
        [__type]: ctx.orm.tables[tb].schema,
    })
}