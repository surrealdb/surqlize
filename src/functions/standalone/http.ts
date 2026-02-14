import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const http = {
	head<C extends WorkableContext>(source: ContextSource<C>, url: Workable<C>) {
		return standaloneFn(source, t.string(), "http::head", url);
	},
	get<C extends WorkableContext>(source: ContextSource<C>, url: Workable<C>) {
		return standaloneFn(source, t.string(), "http::get", url);
	},
	put<C extends WorkableContext>(
		source: ContextSource<C>,
		url: Workable<C>,
		body: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "http::put", url, body);
	},
	post<C extends WorkableContext>(
		source: ContextSource<C>,
		url: Workable<C>,
		body: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "http::post", url, body);
	},
	patch<C extends WorkableContext>(
		source: ContextSource<C>,
		url: Workable<C>,
		body: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "http::patch", url, body);
	},
	del<C extends WorkableContext>(source: ContextSource<C>, url: Workable<C>) {
		return standaloneFn(source, t.string(), "http::delete", url);
	},
};
