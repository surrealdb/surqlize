import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { standaloneFn } from "./index";

export const http = {
	head<C extends WorkableContext>(url: Workable<C>) {
		return standaloneFn(url, t.string(), "http::head", url);
	},
	get<C extends WorkableContext>(url: Workable<C>) {
		return standaloneFn(url, t.string(), "http::get", url);
	},
	put<C extends WorkableContext>(url: Workable<C>, body: Workable<C>) {
		return standaloneFn(url, t.string(), "http::put", url, body);
	},
	post<C extends WorkableContext>(url: Workable<C>, body: Workable<C>) {
		return standaloneFn(url, t.string(), "http::post", url, body);
	},
	patch<C extends WorkableContext>(url: Workable<C>, body: Workable<C>) {
		return standaloneFn(url, t.string(), "http::patch", url, body);
	},
	del<C extends WorkableContext>(url: Workable<C>) {
		return standaloneFn(url, t.string(), "http::delete", url);
	},
};
