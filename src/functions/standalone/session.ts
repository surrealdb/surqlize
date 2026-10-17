import { t } from "../../types";
import type { WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./internal";

// The types follow `$session`, which is what each of these reads. A function is
// optional where the session may lack the thing: a system user has no access
// method or record, a session that signed in with no token has no claims, and
// the namespace and database are absent until one is selected. `ip` is left as
// it was: it was a string in every session observed, though `$session.ip` allows
// for its absence.
export const session = {
	ac<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.option(t.string()), "session::ac");
	},
	db<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.option(t.string()), "session::db");
	},
	id<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.uuid(), "session::id");
	},
	ip<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.string(), "session::ip");
	},
	ns<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.option(t.string()), "session::ns");
	},
	origin<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.option(t.string()), "session::origin");
	},
	rd<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.option(t.record()), "session::rd");
	},
	token<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.option(t.object({})), "session::token");
	},
};
