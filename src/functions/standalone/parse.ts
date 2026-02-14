import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const parse = {
	emailHost<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "parse::email::host", value);
	},
	emailUser<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "parse::email::user", value);
	},
	urlDomain<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "parse::url::domain", value);
	},
	urlFragment<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "parse::url::fragment", value);
	},
	urlHost<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "parse::url::host", value);
	},
	urlPath<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "parse::url::path", value);
	},
	urlPort<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "parse::url::port", value);
	},
	urlQuery<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "parse::url::query", value);
	},
	urlScheme<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "parse::url::scheme", value);
	},
};
