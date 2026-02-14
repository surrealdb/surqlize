import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneConst, standaloneFn } from "./index";

export const time = {
	// Functions

	now<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.date(), "time::now");
	},
	timezone<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneFn(source, t.string(), "time::timezone");
	},

	// Constants

	epoch<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.date(), "time::epoch");
	},
	minimum<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.date(), "time::minimum");
	},
	maximum<C extends WorkableContext>(source: ContextSource<C>) {
		return standaloneConst(source, t.date(), "time::maximum");
	},

	// Conversion functions

	fromMillis<C extends WorkableContext>(ms: Workable<C>) {
		return standaloneFn(ms, t.date(), "time::from_millis", ms);
	},
	fromMicros<C extends WorkableContext>(us: Workable<C>) {
		return standaloneFn(us, t.date(), "time::from_micros", us);
	},
	fromNanos<C extends WorkableContext>(ns: Workable<C>) {
		return standaloneFn(ns, t.date(), "time::from_nanos", ns);
	},
	fromSecs<C extends WorkableContext>(s: Workable<C>) {
		return standaloneFn(s, t.date(), "time::from_secs", s);
	},
	fromUnix<C extends WorkableContext>(s: Workable<C>) {
		return standaloneFn(s, t.date(), "time::from_unix", s);
	},
	fromUlid<C extends WorkableContext>(ulid: Workable<C>) {
		return standaloneFn(ulid, t.date(), "time::from_ulid", ulid);
	},
	fromUuid<C extends WorkableContext>(uuid: Workable<C>) {
		return standaloneFn(uuid, t.date(), "time::from_uuid", uuid);
	},

	// Aggregation functions

	timeMin<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.date(), "time::min", arr);
	},
	timeMax<C extends WorkableContext>(arr: Workable<C>) {
		return standaloneFn(arr, t.date(), "time::max", arr);
	},
};
