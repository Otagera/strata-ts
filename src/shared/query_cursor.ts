import type { StrataKV } from "../kv/engine";
import { QueryOperations, type QueryOperationsType } from "./interfaces";

export class QueryCursor {
	protected _limit: number | null = null;
	constructor(
		protected kv: StrataKV,
		protected prefix: string,
		protected query: Record<string, any>,
	) {}

	limit(n: number) {
		this._limit = n;
		return this;
	}

	async toArray() {
		const results: any[] = [];
		for await (const doc of this) {
			results.push(doc);
		}
		return results;
	}

	matches = (docValue: any, queryValue: any): boolean => {
		if (
			typeof queryValue === "object" &&
			queryValue !== null &&
			!Array.isArray(queryValue)
		) {
			const keys = Object.keys(queryValue) as QueryOperationsType[];
			if (keys.some((k) => k.startsWith("$"))) {
				for (const op of keys) {
					const target = queryValue[op];
					switch (op) {
						case QueryOperations.gt:
							if (!(docValue > target)) return false;
							break;
						case QueryOperations.lt:
							if (!(docValue < target)) return false;
							break;
						case QueryOperations.gte:
							if (!(docValue >= target)) return false;
							break;
						case QueryOperations.lte:
							if (!(docValue <= target)) return false;
							break;
						case QueryOperations.ne:
							if (docValue === target) return false;
							break;
						case QueryOperations.in:
							if (Array.isArray(docValue)) {
								if (!docValue.some((dv) => target.includes(dv))) return false;
							} else {
								if (!Array.isArray(target) || !target.includes(docValue))
									return false;
							}
							break;
						case QueryOperations.nin:
							if (Array.isArray(docValue)) {
								if (docValue.some((dv) => target.includes(dv))) return false;
							} else {
								if (Array.isArray(target) || target.includes(docValue))
									return false;
							}
							break;
						default:
							throw new Error(`Unknown operator: ${op}`);
					}
				}
				return true;
			}
		}
		return docValue === queryValue;
	};

	async *[Symbol.asyncIterator]() {
		const result = this.kv.scan(this.prefix);

		let count = 0;
		for await (const { key, value } of result) {
			try {
				const parsedValue = JSON.parse(value);
				let isMatch = true;
				for (const qKey in this.query) {
					isMatch = this.matches(parsedValue[qKey], this.query[qKey]);
					if (!isMatch) {
						break;
					}
				}
				if (isMatch) {
					yield parsedValue;
					count++;
					if (this._limit && count >= this._limit) break;
				}
			} catch (error) {}
		}
	}
}

export class IndexQueryCursor extends QueryCursor {
	constructor(
		kv: StrataKV,
		prefix: string,
		query: Record<string, any>,
		private indexPrefix: string,
	) {
		super(kv, prefix, query);
	}

	async *[Symbol.asyncIterator]() {
		const indexScan = this.kv.scan(this.indexPrefix);

		let count = 0;
		for await (const { key } of indexScan) {
			const id = key.slice(this.indexPrefix.length);
			const docKey = this.prefix + id;
			const docValue = await this.kv.database_get(docKey);
			if (!docValue) continue;

			try {
				const parsedValue = JSON.parse(docValue);
				let isMatch = true;
				for (const qKey in this.query) {
					isMatch = this.matches(parsedValue[qKey], this.query[qKey]);
					if (!isMatch) {
						break;
					}
				}
				if (isMatch) {
					yield parsedValue;
					count++;
					if (this._limit && count >= this._limit) break;
				}
			} catch (error) {}
		}
	}
}
