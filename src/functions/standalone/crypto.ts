import { t } from "../../types";
import type { Workable, WorkableContext } from "../../utils";
import { type ContextSource, standaloneFn } from "./index";

export const crypto = {
	// Hashing functions

	blake3<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "crypto::blake3", value);
	},
	joaat<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.number(), "crypto::joaat", value);
	},
	md5<C extends WorkableContext>(source: ContextSource<C>, value: Workable<C>) {
		return standaloneFn(source, t.string(), "crypto::md5", value);
	},
	sha1<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "crypto::sha1", value);
	},
	sha256<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "crypto::sha256", value);
	},
	sha512<C extends WorkableContext>(
		source: ContextSource<C>,
		value: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "crypto::sha512", value);
	},

	// Password functions

	argon2Compare<C extends WorkableContext>(
		source: ContextSource<C>,
		hash: Workable<C>,
		pass: Workable<C>,
	) {
		return standaloneFn(
			source,
			t.bool(),
			"crypto::argon2::compare",
			hash,
			pass,
		);
	},
	argon2Generate<C extends WorkableContext>(
		source: ContextSource<C>,
		pass: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "crypto::argon2::generate", pass);
	},
	bcryptCompare<C extends WorkableContext>(
		source: ContextSource<C>,
		hash: Workable<C>,
		pass: Workable<C>,
	) {
		return standaloneFn(
			source,
			t.bool(),
			"crypto::bcrypt::compare",
			hash,
			pass,
		);
	},
	bcryptGenerate<C extends WorkableContext>(
		source: ContextSource<C>,
		pass: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "crypto::bcrypt::generate", pass);
	},
	pbkdf2Compare<C extends WorkableContext>(
		source: ContextSource<C>,
		hash: Workable<C>,
		pass: Workable<C>,
	) {
		return standaloneFn(
			source,
			t.bool(),
			"crypto::pbkdf2::compare",
			hash,
			pass,
		);
	},
	pbkdf2Generate<C extends WorkableContext>(
		source: ContextSource<C>,
		pass: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "crypto::pbkdf2::generate", pass);
	},
	scryptCompare<C extends WorkableContext>(
		source: ContextSource<C>,
		hash: Workable<C>,
		pass: Workable<C>,
	) {
		return standaloneFn(
			source,
			t.bool(),
			"crypto::scrypt::compare",
			hash,
			pass,
		);
	},
	scryptGenerate<C extends WorkableContext>(
		source: ContextSource<C>,
		pass: Workable<C>,
	) {
		return standaloneFn(source, t.string(), "crypto::scrypt::generate", pass);
	},
};
