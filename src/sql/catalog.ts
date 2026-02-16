import type { StrataDoc } from "../doc/engine";
import type { ColumnDefinition, TableSchema } from "../shared/interfaces";

export class SystemCatalog {
	private doc: StrataDoc;
	private readonly COLLECTION = "_schema";

	constructor(doc: StrataDoc) {
		this.doc = doc;
	}

	/**
	 * Creates a new table entry in the system catalog.
	 */
	async createTable(name: string, columns: ColumnDefinition[]): Promise<void> {
		const existing = await this.getTable(name);
		if (existing) {
			throw new Error(`Table '${name}' already exists`);
		}

		await this.doc.insert(this.COLLECTION, {
			_id: name,
			name,
			columns,
		});
	}

	/**
	 * Retrieves the schema for a given table.
	 */
	async getTable(name: string): Promise<TableSchema | null> {
		return await this.doc.findById(this.COLLECTION, name);
	}

	/**
	 * Lists all tables in the database.
	 */
	async listTables(): Promise<string[]> {
		const results = await this.doc.find(this.COLLECTION, {}).toArray();
		return results.map((r) => r.name);
	}
}
