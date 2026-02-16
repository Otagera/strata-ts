import type { IKVIterator, Pair } from "../shared/interfaces";

export class KWayMergeIterator {
	private cursors: IKVIterator[];
	private DB_SENTINEL_VALUE = "$nullified";

	constructor(cursors: IKVIterator[], db_sentinel_value?: string) {
		this.cursors = cursors;
		if (db_sentinel_value) {
			this.DB_SENTINEL_VALUE = db_sentinel_value;
		}
	}
	init() {}
	next = async (): Promise<Pair | null> => {
		if (this.cursors.length === 0) return null;

		const line: Pair | null = null;

		while (this.cursors.some((c) => !c.done)) {
			let minKey: string | null = null;
			const cursorsWithMinKey: IKVIterator[] = [];

			for (const cursor of this.cursors) {
				if (!cursor.done) {
					if (minKey === null || cursor.key! < minKey) {
						minKey = cursor.key;
						cursorsWithMinKey.length = 0;
						cursorsWithMinKey.push(cursor);
					} else if (cursor.key === minKey) {
						cursorsWithMinKey.push(cursor);
					}
				}
			}

			const winner = cursorsWithMinKey[0];

			if (minKey === null) return null;
			if (!winner) return null;

			const value = winner.value!;
			const key = winner.key!;

			for (const cursor of cursorsWithMinKey) {
				await cursor.advance();
			}

			if (value !== undefined && value !== this.DB_SENTINEL_VALUE) {
				return { key, value };
			}
		}
		return null;
	};
}
