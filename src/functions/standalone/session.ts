import { t } from "../../types";
import type { WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const session = {
	ac<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.string(), "session::ac");
	},
	db<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.string(), "session::db");
	},
	id<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.string(), "session::id");
	},
	ip<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.string(), "session::ip");
	},
	ns<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.string(), "session::ns");
	},
	origin<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.string(), "session::origin");
	},
	rd<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.string(), "session::rd");
	},
	token<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.string(), "session::token");
	},
};
