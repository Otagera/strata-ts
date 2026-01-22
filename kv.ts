import { createReadStream } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import {
	appendFile,
	stat,
	mkdir,
	readdir,
	readFile,
} from "node:fs/promises";
import path from "node:path";
import { createInterface } from "readline/promises";
import { BloomFilter } from "./bloom_filter";

// --- Interfaces ---
interface SSTMetadata {
	filename: string;
	minKey: string;
	maxKey: string;
	filter: BloomFilter;
}

export class StrataKV {
	// --- Configuration ---
	private DATA_DIR = "data";
	private SST_FILE_EXT = ".sst";
	private SST_META_FILE_EXT = ".meta.json";
	private ENCODING: BufferEncoding = "utf8";
	private DB_SENTINEL_VALUE = "$nullified";
	private MEMTABLE_LIMIT = 5;

	private sst_files: SSTMetadata[] = [];
	private mem_table = new Map<string, string>();

	constructor() {}

	/**
	 * Initializes the database by loading existing SSTable metadata from disk.
	 */
	public database_init = async () => {
		try {
			await mkdir(this.DATA_DIR, { recursive: true });
			const files = await readdir(this.DATA_DIR);

			const sorted_files = await this.readDirSortedByTime(
				this.DATA_DIR,
				files.filter((file) => file.endsWith(this.SST_FILE_EXT))
			);

			this.sst_files = await Promise.all(
				sorted_files.map(async (filename) => {
						const meta = await this.get_file_meta(filename);
						return { ...meta, filename };
					})
			);
		} catch (error) {
			console.error("Initialization error:", error);
		}
	};

	/**
	 * Retrieves a value from the database.
	 * Checks MemTable first, then searches SSTables using Bloom Filters and Sparse Indexing.
	 */
	public database_get = async (key: string): Promise<string | null> => {
		// 1. Check in-memory MemTable
		const mem_value = this.mem_table.get(key);
		if (mem_value !== undefined) {
			return mem_value === this.DB_SENTINEL_VALUE ? null : mem_value;
		}

		// 2. Search through SSTables
		try {
			let found_value: string | null = null;
			for (const sst of this.sst_files) {
				// Sparse Index Check
				if (key >= sst.minKey && key <= sst.maxKey) {
					// Bloom Filter Check
					if (sst.filter.contains(key)) {
							found_value = await this.search_sst_file(sst.filename, key);
							if (found_value !== null) break;
						}
				}
			}

			return found_value === this.DB_SENTINEL_VALUE ? null : found_value;
		} catch (error) {
			console.error("Error reading file:", error);
			return null;
		}
	};

	/**
	 * Inserts or updates a key-value pair.
	 */
	public database_set = async (key: string, value: string) => {
		this.mem_table.set(key, value);
		if (this.mem_table.size >= this.MEMTABLE_LIMIT) await this.flush_mem_table();
	};

	/**
	 * Deletes a key by writing a tombstone record.
	 */
	public database_delete = async (key: string) => {
		this.mem_table.set(key, this.DB_SENTINEL_VALUE);
		if (this.mem_table.size >= this.MEMTABLE_LIMIT) await this.flush_mem_table();
	};

	/**
	 * Gracefully shuts down the database by flushing remaining memory to disk.
	 */
	public database_close = async () => {
		if (this.mem_table.size > 0) {
			await this.flush_mem_table();
		}
		this._reset_db_state();
	};

	// --- Private Helpers ---

	/**
	 * Flushes the current MemTable to a new SSTable and its corresponding metadata file.
	 */
	private flush_mem_table = async () => {
		const filter = new BloomFilter(128, 3);
		const sorted_keys = [...this.mem_table.keys()].sort();
		let big_str = "";

		for (const key of sorted_keys) {
			filter.add(key);
			const value = this.mem_table.get(key);
			big_str += `${key}:${value}\n`;
		}

		if (big_str && sorted_keys.length > 0) {
			const timestamp = Date.now();
			const filename = `sst_${timestamp}${this.SST_FILE_EXT}`;
			const filename_meta = `sst_${timestamp}${this.SST_META_FILE_EXT}`;

			const minKey = sorted_keys[0] || "";
			const maxKey = sorted_keys[sorted_keys.length - 1] || "";

			await appendFile(path.join(this.DATA_DIR, filename), big_str);
			await appendFile(
				path.join(this.DATA_DIR, filename_meta),
				JSON.stringify({
					minKey,
					maxKey,
					filterData: filter.serialize(),
				})
			);
			this.sst_files.unshift({
				filename,
				minKey,
				maxKey,
				filter,
			});
			this.mem_table.clear();
		}
	};

	/**
	 * Searches a single SSTable file for a specific key.
	 */
	private search_sst_file = async (filename: string, key: string) => {
		const fileStream = createReadStream(path.join(this.DATA_DIR, filename), {
			encoding: this.ENCODING,
		});

		const rl = createInterface({
			input: fileStream,
			crlfDelay: Infinity, // Treats '\r\n' as a single newline character
		});

		for await (const line of rl) {
			// Use indexOf to safely handle values containing colons
			const separatorIndex = line.indexOf(":");
			if (separatorIndex === -1) continue;

			const line_key = line.substring(0, separatorIndex);
			if (line_key === key) {
				return line.substring(separatorIndex + 1) || null;
			}
		}
		return null;
	};

	/**
	 * Loads metadata from a .meta.json file.
	 */
	private get_file_meta = async (filename: string) => {
		const metaPath = path.join(
			this.DATA_DIR,
			filename.replace(this.SST_FILE_EXT, this.SST_META_FILE_EXT)
		);
		const file = await readFile(metaPath, { encoding: this.ENCODING });
		const data = JSON.parse(file);
		const filter = BloomFilter.deserialize(data.filterData, 128, 3);

		return {
			minKey: data.minKey,
			maxKey: data.maxKey,
			filter,
		};
	};

	private readDirSortedByTime = async (dirpath: string, files: string[]) => {
		const stats = await Promise.all(
			files.map(async (filename) => {
				const file_stat = await stat(path.join(dirpath, filename));
				return { filename, mtime: file_stat.mtime.getTime() };
			})
		);

		stats.sort((a, b) => b.mtime - a.mtime);
		return stats.map((stat) => stat.filename);
	};

	public compaction = async () => {
		// To be implemented
	};

	// --- Debug & Test Tools ---

	public _reset_db_state = () => {
		this.sst_files = [];
		this.mem_table.clear();
	};
	public _get_db_size = () => this.mem_table.size;
}