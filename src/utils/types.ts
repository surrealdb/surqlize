export type At<T extends unknown[], N extends number> = T extends [
	...infer Rest,
	infer Last,
]
	? N extends -1
		? Last
		: Rest extends [...unknown[], infer SecondLast]
			? N extends -2
				? SecondLast
				: T[N & keyof T]
			: T[N & keyof T]
	: never;
