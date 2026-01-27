import { StrataKV } from "../kv/engine";
import { QueryCursor, IndexQueryCursor } from "../shared/query_cursor";
import type { StrataDocFindOptions } from "../shared/interfaces";
import { StrataId } from "./id";

export class StrataDoc {
	private kv = new StrataKV();
	private indexes: Map<string, Set<string>> = new Map();

	constructor(config?: { dataDir?: string }) {
		if (config) {
			this.kv = new StrataKV(config);
		}
	}

	init = async () => {
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
		id: string
	) => {
		if (collection.includes("::") || indexName.includes("::")) {
			throw new Error("Collection and index names cannot contain '::'");
		}
		// IDX::collection::field::value::id
		return encodeURIComponent(
			`IDX::${collection}::${indexName}::${indexValue}::${id}`
		);
	};
	createIndex(collection: string, field: string) {
		if (!this.indexes.has(collection)) {
			this.indexes.set(collection, new Set());
		}
		this.indexes.get(collection)?.add(field);
	}

	insert = async (collection: string, doc: Record<string, any>) => {
		const existing = await this.findById(collection, doc._id);
		if (existing) {
			throw new Error(
				`Document with _id ${doc._id} already exists in collection ${collection}`
			);
		}
		const _id = (doc._id || StrataId.generate()) as string;
		const key = this._makeKey(collection, _id);

		const docWithId = { ...doc, _id };
		const value = JSON.stringify(docWithId);

		await this.kv.database_set(key, value);
		for (const field of this.indexes.get(collection) || []) {
			if (docWithId[field] !== undefined) {
				const indexKey = this._makeIndexKey(
					collection,
					field,
					String(docWithId[field]),
					_id
				);
				await this.kv.database_set(indexKey, "");
			}
		}
		return docWithId;
	};
	update = async (collection: string, doc: Record<string, any>) => {
		const existing = await this.findById(collection, doc._id);
		if (!existing) {
			throw new Error(
				`Document with _id ${doc._id} does not exist in collection ${collection}`
			);
		}
		const _id = doc._id;
		const key = this._makeKey(collection, _id);

		const updatedDoc = { ...existing, ...doc };
		const value = JSON.stringify(updatedDoc);

		await this.kv.database_set(key, value);
		return updatedDoc;
	};

	findById = async (collection: string, id: string) => {
		const key = this._makeKey(collection, id);
		const value = await this.kv.database_get(key);

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
		options?: StrataDocFindOptions
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
						""
					);
					const cursor = new IndexQueryCursor(
						this.kv,
						docPrefix,
						query,
						indexPrefix
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
