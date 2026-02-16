import { StrataKV } from "../kv/engine";
import type { Transaction } from "../kv/transaction";
import type { StrataDocFindOptions } from "../shared/interfaces";
import { IndexQueryCursor, QueryCursor } from "../shared/query_cursor";
import { StrataId } from "./id";

export class StrataDoc {
	private kv: StrataKV;
	private indexes: Map<string, Set<string>> = new Map();

	constructor(configOrKV?: { dataDir?: string } | StrataKV) {
		if (configOrKV instanceof StrataKV) {
			this.kv = configOrKV;
		} else {
			this.kv = new StrataKV(configOrKV);
		}
	}

	public get engine(): StrataKV {
		return this.kv;
	}

	init = async () => {
		// If we own the KV (config passed), we init it.
		// If KV was injected, we assume caller handles init, or we do it safely (idempotent).
		await this.kv.database_init();
	};
	private _makeKey = (collection: string, id: string) => {
		if (collection.includes("::")) {
			throw new Error("Collection name cannot contain '::'");
		}
		return encodeURIComponent(`${collection}::${id}`);
	};
	private _makeIndexKey = (
		collection: string,
		indexName: string,
		indexValue: string,
		id: string,
	) => {
		if (collection.includes("::") || indexName.includes("::")) {
			throw new Error("Collection and index names cannot contain '::'");
		}
		// IDX::collection::field::value::id
		return encodeURIComponent(
			`IDX::${collection}::${indexName}::${indexValue}::${id}`,
		);
	};
	createIndex(collection: string, field: string) {
		if (!this.indexes.has(collection)) {
			this.indexes.set(collection, new Set());
		}
		this.indexes.get(collection)?.add(field);
	}

	private _dbSet = async (key: string, value: string, tx?: Transaction) => {
		if (tx) {
			tx.set(key, value);
		} else {
			await this.kv.database_set(key, value);
		}
	};

	private _dbDelete = async (key: string, tx?: Transaction) => {
		if (tx) {
			tx.delete(key);
		} else {
			await this.kv.database_delete(key);
		}
	};

	insert = async (
		collection: string,
		doc: Record<string, any>,
		tx?: Transaction,
	) => {
		const existing = await this.findById(collection, doc._id, tx);
		if (existing) {
			throw new Error(
				`Document with _id ${doc._id} already exists in collection ${collection}`,
			);
		}
		const _id = (doc._id || StrataId.generate()) as string;
		const key = this._makeKey(collection, _id);

		const docWithId: Record<string, any> = { ...doc, _id };
		const value = JSON.stringify(docWithId);

		await this._dbSet(key, value, tx);

		for (const field of this.indexes.get(collection) || []) {
			if (docWithId[field] !== undefined) {
				const indexKey = this._makeIndexKey(
					collection,
					field,
					String(docWithId[field]),
					_id,
				);
				await this._dbSet(indexKey, "", tx);
			}
		}
		return docWithId;
	};

	update = async (
		collection: string,
		doc: Record<string, any>,
		tx?: Transaction,
	) => {
		const existing = await this.findById(collection, doc._id, tx);
		if (!existing) {
			throw new Error(
				`Document with _id ${doc._id} does not exist in collection ${collection}`,
			);
		}
		const _id = doc._id;
		const key = this._makeKey(collection, _id);

		// Handle Index Updates (Very basic: remove old, add new)
		// Note: A real implementation would compare old and new values
		const updatedDoc = { ...existing, ...doc };
		const value = JSON.stringify(updatedDoc);

		await this._dbSet(key, value, tx);

		// Index maintenance (Placeholder for more robust logic)
		for (const field of this.indexes.get(collection) || []) {
			if (doc[field] !== undefined && doc[field] !== existing[field]) {
				// Remove old index
				const oldIndexKey = this._makeIndexKey(
					collection,
					field,
					String(existing[field]),
					_id,
				);
				await this._dbDelete(oldIndexKey, tx);

				// Add new index
				const newIndexKey = this._makeIndexKey(
					collection,
					field,
					String(doc[field]),
					_id,
				);
				await this._dbSet(newIndexKey, "", tx);
			}
		}

		return updatedDoc;
	};

	deleteOne = async (collection: string, id: string, tx?: Transaction) => {
		const existing = await this.findById(collection, id, tx);
		if (!existing) return false;

		const key = this._makeKey(collection, id);
		await this._dbDelete(key, tx);

		// Remove Indexes
		for (const field of this.indexes.get(collection) || []) {
			if (existing[field] !== undefined) {
				const indexKey = this._makeIndexKey(
					collection,
					field,
					String(existing[field]),
					id,
				);
				await this._dbDelete(indexKey, tx);
			}
		}

		return true;
	};

	findById = async (collection: string, id: string, tx?: Transaction) => {
		const key = this._makeKey(collection, id);
		let value;
		if (tx) {
			value = await tx.get(key);
		} else {
			value = await this.kv.database_get(key);
		}

		if (!value) {
			return null;
		}

		try {
			const parsedValue = JSON.parse(value);
			return parsedValue;
		} catch (error) {
			return null;
		}
	};

	find = (
		collection: string,
		query: Record<string, any>,
		options?: StrataDocFindOptions,
		tx?: Transaction,
	) => {
		const docPrefix = this._makeKey(collection, "");
		const indexes = this.indexes.get(collection);

		if (indexes) {
			for (const field of indexes) {
				const queryVal = query[field];

				if (queryVal !== undefined && typeof queryVal !== "object") {
					const indexPrefix = this._makeIndexKey(
						collection,
						field,
						String(queryVal),
						"",
					);
					const cursor = new IndexQueryCursor(
						this.kv,
						docPrefix,
						query,
						indexPrefix,
					);
					if (options?.limit) {
						cursor.limit(options.limit);
					}
					return cursor;
				}
			}
		}
		const prefix = this._makeKey(collection, "");
		const cursor = new QueryCursor(this.kv, prefix, query);
		if (options?.limit) {
			cursor.limit(options.limit);
		}
		return cursor;
	};

	close = async () => {
		await this.kv.database_close();
	};
}
