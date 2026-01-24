export interface ICursor {
	key: string | null;
	value: string | null;
	done: boolean;
	init(): Promise<void> | void;
	advance(): Promise<void> | void;
}

export interface Pair {
	key: string;
	value: string;
}

export interface BlockIndex {
	key: string;
	offset: number;
}
