import type { ICursor, Pair } from "../shared/interfaces";

export class KWayMergeIterator {
	private cursors: ICursor[];
	private DB_SENTINEL_VALUE = "$nullified";

	constructor(cursors: ICursor[], db_sentinel_value?: string) {
		this.cursors = cursors;
		if (db_sentinel_value) {
			this.DB_SENTINEL_VALUE = db_sentinel_value;
		}
	}
	init() {}
	next = async (): Promise<Pair | null> => {
		if (this.cursors.length === 0) return null;

		let line: Pair | null = null;

		while (this.cursors.some((c) => !c.done)) {
			let minKey: string | null = null;
			const cursorsWithMinKey: ICursor[] = [];

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

			let winner = cursorsWithMinKey[0];

			if (minKey === null) return null;
			if (!winner) return null;

			const value = winner.value!;
			const key = winner.key!;

			for (const cursor of cursorsWithMinKey) {
				await cursor.advance();
			}

			if (value && value !== this.DB_SENTINEL_VALUE) {
				return { key, value };
			}
		}
		return null;
	};
}
