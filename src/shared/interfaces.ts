export interface IKVIterator {
	init(): Promise<void>;
	advance(): Promise<void>;
	seek?(key: string): Promise<void>;
	get key(): string | null;
	get value(): string | null;
	get done(): boolean;
}

export interface Pair {
	key: string;
	value: string;
}

export interface BlockIndex {
	key: string;
	offset: number;
}

export interface StrataDocFindOptions {
	limit?: number;
	skip?: number;
}

export const QueryOperations = {
	gt: "$gt",
	lt: "$lt",
	gte: "$gte",
	lte: "$lte",
	ne: "$ne",
	in: "$in",
	nin: "$nin",
} as const;
export type QueryOperationsType =
	(typeof QueryOperations)[keyof typeof QueryOperations];
