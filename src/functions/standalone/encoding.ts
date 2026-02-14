import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { standaloneFn } from "./index";

export const encoding = {
	base64Decode<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "encoding::base64::decode", value);
	},
	base64Encode<C extends WorkableContext>(value: Workable<C>) {
		return standaloneFn(value, t.string(), "encoding::base64::encode", value);
	},
};
