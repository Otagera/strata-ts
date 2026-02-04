import type { WALBatch } from "../shared/interfaces";
import type { StrataKV } from "./engine";

export class Transaction {
	private buffer: WALBatch = new Map();
	private db: StrataKV;

	constructor(db: StrataKV) {
		this.db = db;
	}

	public set = (key: string, value: string) => {
		this.buffer.set(key, value);
	};
	public get = (key: string) => {
		if (this.buffer.has(key)) {
			return this.buffer.get(key);
		}
		return this.db.database_get(key);
	};
	public delete = (key: string) => {
		this.buffer.set(key, this.db._get_db_sentinel_value());
	};
	public commit = () => {
		if (this.buffer.size === 0) {
			return;
		}

		this.db.commitBatch(this.buffer);

		this.buffer.clear();
	};
	public wrapInEnvelope = (buffer: Map<string, string>): string => {
		return JSON.stringify(Object.fromEntries(buffer));
	};
}
